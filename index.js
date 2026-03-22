const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// ==================== KONFIGURASI MONGODB ====================
// GANTI DENGAN CONNECTION STRING DARI MONGODB ATLAS!
const MONGODB_URI = 'mongodb+srv://rulzzofficial:Rulzz0411@login-otp.xtqqqnc.mongodb.net/';
const DB_NAME = 'Login-OTP';

let db;
let usersCollection;
let otpCollection;

// Koneksi ke MongoDB
async function connectDB() {
    try {
        const client = new MongoClient(MONGODB_URI);
        await client.connect();
        db = client.db(DB_NAME);
        usersCollection = db.collection('users');
        otpCollection = db.collection('otps');
        
        // Buat index untuk performance
        await usersCollection.createIndex({ email: 1 }, { unique: true });
        await usersCollection.createIndex({ username: 1 }, { unique: true });
        await usersCollection.createIndex({ phone: 1 }, { unique: true, sparse: true });
        await otpCollection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // Auto delete expired OTP
        
        console.log('✅ MongoDB Connected!');
        
        // Seed data awal jika kosong
        const userCount = await usersCollection.countDocuments();
        if (userCount === 0) {
            await seedInitialData();
        }
        
    } catch (error) {
        console.error('❌ MongoDB Connection Error:', error);
        process.exit(1);
    }
}

// Seed data awal
async function seedInitialData() {
    const initialUsers = [
        {
            username: 'admin',
            email: 'admin@aryastore.com',
            password: 'admin123',
            name: 'Admin Arya',
            phone: '081234567890',
            role: 'admin',
            createdAt: new Date()
        },
        {
            username: 'user',
            email: 'user@aryastore.com',
            password: 'user123',
            name: 'User Biasa',
            phone: '081298765432',
            role: 'user',
            createdAt: new Date()
        },
        {
            username: 'rulzz',
            email: 'khoirull1841@gmail.com',
            password: 'rulzz123',
            name: 'Rulzz Test',
            phone: '081255555555',
            role: 'user',
            createdAt: new Date()
        }
    ];
    
    await usersCollection.insertMany(initialUsers);
    console.log('📦 Seed data inserted!');
}

// ==================== KONFIGURASI SMTP GMAIL ====================
const EMAIL_USER = 'rulzzofficial628@gmail.com';
const EMAIL_PASS = 'ivqh ufzo ebvv hsad';

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
    tls: { rejectUnauthorized: false }
});

transporter.verify((error) => {
    if (error) console.log('❌ SMTP Error:', error.message);
    else console.log('✅ SMTP Ready!');
});

// ==================== API ENDPOINTS ====================

// 1. Login
app.post('/api/login', async (req, res) => {
    const { identifier, password } = req.body;
    
    try {
        const user = await usersCollection.findOne({
            $or: [
                { email: identifier },
                { phone: identifier },
                { username: identifier }
            ]
        });
        
        if (user && user.password === password) {
            res.json({
                success: true,
                message: 'Login berhasil',
                user: {
                    id: user._id,
                    username: user.username,
                    name: user.name,
                    email: user.email,
                    phone: user.phone,
                    role: user.role
                },
                redirect: user.role === 'admin' ? '/admin/dashboard' : '/dashboard'
            });
        } else {
            res.status(401).json({ success: false, error: 'Email/Username/HP atau Password salah' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// 2. Register
app.post('/api/register', async (req, res) => {
    const { username, email, phone, password } = req.body;
    
    // Validasi
    if (!username || username.length < 3) {
        return res.status(400).json({ success: false, error: 'Username minimal 3 karakter' });
    }
    if (!password || password.length < 6) {
        return res.status(400).json({ success: false, error: 'Password minimal 6 karakter' });
    }
    if (!email && !phone) {
        return res.status(400).json({ success: false, error: 'Email atau Nomor HP harus diisi' });
    }
    
    try {
        // Cek duplikat
        const existingUser = await usersCollection.findOne({
            $or: [
                { username },
                { email: email || undefined },
                { phone: phone || undefined }
            ].filter(Boolean)
        });
        
        if (existingUser) {
            if (existingUser.username === username) {
                return res.status(400).json({ success: false, error: 'Username sudah terdaftar' });
            }
            if (existingUser.email === email) {
                return res.status(400).json({ success: false, error: 'Email sudah terdaftar' });
            }
            if (existingUser.phone === phone) {
                return res.status(400).json({ success: false, error: 'Nomor HP sudah terdaftar' });
            }
        }
        
        const newUser = {
            username,
            email: email || null,
            phone: phone || null,
            password,
            name: username,
            role: 'user',
            createdAt: new Date()
        };
        
        const result = await usersCollection.insertOne(newUser);
        
        res.json({
            success: true,
            message: 'Registrasi berhasil! Silakan login.',
            user: {
                id: result.insertedId,
                username,
                email,
                phone,
                role: 'user'
            }
        });
        
    } catch (error) {
        res.status(500).json({ success: false, error: 'Registrasi gagal' });
    }
});

// 3. Forgot Password - Kirim OTP
app.post('/api/forgot-password', async (req, res) => {
    const { email } = req.body;
    
    try {
        const user = await usersCollection.findOne({ email });
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'Email tidak terdaftar' });
        }
        
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        
        // Simpan OTP ke database
        await otpCollection.insertOne({
            email,
            code: otp,
            expiresAt,
            attempts: 0,
            createdAt: new Date()
        });
        
        console.log(`📧 OTP untuk ${email}: ${otp}`);
        
        await transporter.sendMail({
            from: `"Arya Store" <${EMAIL_USER}>`,
            to: email,
            subject: '🔐 Reset Password - Arya Store',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #667eea;">Reset Password</h2>
                    <p>Halo <strong>${user.name}</strong>,</p>
                    <p>Kode OTP Anda:</p>
                    <div style="background: #f5f5f5; padding: 20px; text-align: center;">
                        <h1 style="color: #667eea; font-size: 42px;">${otp}</h1>
                    </div>
                    <p>Kode berlaku 10 menit.</p>
                </div>
            `
        });
        
        res.json({ success: true, message: 'Kode OTP telah dikirim' });
        
    } catch (error) {
        res.status(500).json({ success: false, message: 'Gagal mengirim OTP' });
    }
});

// 4. Verify OTP
app.post('/api/verify-otp', async (req, res) => {
    const { email, otp } = req.body;
    
    try {
        const otpData = await otpCollection.findOne({ email, code: otp });
        
        if (!otpData) {
            return res.status(400).json({ success: false, message: 'OTP tidak ditemukan' });
        }
        
        if (new Date() > otpData.expiresAt) {
            await otpCollection.deleteOne({ _id: otpData._id });
            return res.status(400).json({ success: false, message: 'OTP sudah kadaluarsa' });
        }
        
        await otpCollection.deleteOne({ _id: otpData._id });
        
        res.json({
            success: true,
            message: 'OTP valid',
            resetToken: 'reset-token-' + Date.now()
        });
        
    } catch (error) {
        res.status(500).json({ success: false, message: 'Verifikasi gagal' });
    }
});

// 5. Reset Password
app.post('/api/reset-password', async (req, res) => {
    const { email, newPassword } = req.body;
    
    try {
        const result = await usersCollection.updateOne(
            { email },
            { $set: { password: newPassword } }
        );
        
        if (result.matchedCount === 0) {
            return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
        }
        
        res.json({ success: true, message: 'Password berhasil direset' });
        
    } catch (error) {
        res.status(500).json({ success: false, message: 'Reset password gagal' });
    }
});

// 6. Serve halaman
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));

// 7. Health check
app.get('/api/health', async (req, res) => {
    const userCount = await usersCollection.countDocuments();
    res.json({ status: 'OK', users: userCount, timestamp: new Date() });
});

// ==================== START SERVER ====================
connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`
        ╔════════════════════════════════════════╗
        ║   🚀 Arya Store with MongoDB Ready     ║
        ╠════════════════════════════════════════╣
        ║  URL: http://localhost:${PORT}          ║
        ║  Database: MongoDB Atlas               ║
        ╚════════════════════════════════════════╝
        `);
    });
});