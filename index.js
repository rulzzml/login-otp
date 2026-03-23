const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');

const app = express();
const JWT_SECRET = 'rulzz_official_secret_2024';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== KONFIGURASI ====================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://rulzzofficial:Rulzz0411@login-otp.xtqqqnc.mongodb.net/login?retryWrites=true&w=majority';
const DB_NAME = 'login';
const EMAIL_USER = 'rulzzofficial628@gmail.com';
const EMAIL_PASS = 'ivqh ufzo ebvv hsad';

// Google OAuth Config
const GOOGLE_CLIENT_ID = '990129659901-53mi2ha6vvvaj6nt4trkv469ip9ij1e6.apps.googleusercontent.com';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

let db;
let usersCollection;
let otpsCollection;

// Koneksi Database
async function connectDB() {
    if (db) return { db, users: usersCollection, otps: otpsCollection };
    
    const client = new MongoClient(MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        connectTimeoutMS: 30000,
        socketTimeoutMS: 30000,
        serverSelectionTimeoutMS: 30000,
        tls: true,
        tlsAllowInvalidCertificates: true,
        tlsAllowInvalidHostnames: true
    });
    
    await client.connect();
    db = client.db(DB_NAME);
    usersCollection = db.collection('users');
    otpsCollection = db.collection('otps');
    
    console.log('✅ MongoDB Connected');
    
    // Buat collections jika belum ada
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    if (!collectionNames.includes('users')) {
        await db.createCollection('users');
        console.log('📁 Collection "users" created');
    }
    if (!collectionNames.includes('otps')) {
        await db.createCollection('otps');
        console.log('📁 Collection "otps" created');
    }
    
    // Buat index
    try {
        await usersCollection.createIndex({ email: 1 }, { unique: true });
        await usersCollection.createIndex({ username: 1 }, { unique: true });
        await usersCollection.createIndex({ googleId: 1 }, { unique: true, sparse: true });
        await otpsCollection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
        console.log('✅ Indexes created');
    } catch (indexError) {
        console.log('Index creation skipped:', indexError.message);
    }
    
    // Seed data jika kosong
    const userCount = await usersCollection.countDocuments();
    if (userCount === 0) {
        await usersCollection.insertMany([
            {
                username: 'admin',
                email: 'admin@aryastore.com',
                password: await bcrypt.hash('admin123', 10),
                name: 'Admin Arya',
                phone: '081234567890',
                role: 'admin',
                provider: 'local',
                verified: true,
                createdAt: new Date()
            },
            {
                username: 'user',
                email: 'user@aryastore.com',
                password: await bcrypt.hash('user123', 10),
                name: 'User Biasa',
                phone: '081298765432',
                role: 'user',
                provider: 'local',
                verified: true,
                createdAt: new Date()
            },
            {
                username: 'rulzz',
                email: 'khoirull1841@gmail.com',
                password: await bcrypt.hash('rulzz123', 10),
                name: 'Rulzz Test',
                phone: '081255555555',
                role: 'user',
                provider: 'local',
                verified: true,
                createdAt: new Date()
            }
        ]);
        console.log('📦 Seed data inserted!');
    }
    
    return { db, users: usersCollection, otps: otpsCollection };
}

// SMTP Transporter
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

// ==================== MIDDLEWARE AUTH ====================
const authMiddleware = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ success: false, message: 'No token provided' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.id;
        next();
    } catch (error) {
        res.status(401).json({ success: false, message: 'Invalid token' });
    }
};

// ==================== API ENDPOINTS ====================

// 1. Google Config
app.get('/api/google/config', (req, res) => {
    res.json({ success: true, clientId: GOOGLE_CLIENT_ID });
});

// 2. Google Auth
app.post('/api/auth/google', async (req, res) => {
    try {
        const { credential } = req.body;
        if (!credential) {
            return res.status(400).json({ success: false, message: 'No credential provided' });
        }

        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: GOOGLE_CLIENT_ID
        });
        
        const payload = ticket.getPayload();
        const { email, name, picture, sub: googleId } = payload;
        
        await connectDB();
        
        let user = await usersCollection.findOne({ email });
        
        if (!user) {
            const newUser = {
                email: email,
                name: name,
                username: name ? name.toLowerCase().replace(/\s/g, '') : email.split('@')[0],
                picture: picture,
                provider: 'google',
                providerId: googleId,
                verified: true,
                role: 'user',
                createdAt: new Date()
            };
            const result = await usersCollection.insertOne(newUser);
            user = { ...newUser, _id: result.insertedId };
            console.log(`✅ New user via Google: ${email}`);
        } else if (!user.picture && picture) {
            await usersCollection.updateOne({ _id: user._id }, { $set: { picture } });
            user.picture = picture;
        }

        const token = jwt.sign(
            { id: user._id, email: user.email, name: user.name, username: user.username, picture: user.picture, role: user.role, verified: user.verified },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                username: user.username,
                picture: user.picture,
                provider: user.provider,
                role: user.role,
                verified: user.verified
            }
        });
        
    } catch (error) {
        console.error('❌ Google auth error:', error);
        res.status(500).json({ success: false, message: 'Google login failed' });
    }
});

// 3. Register (local)
app.post('/api/register', async (req, res) => {
    const { username, email, phone, password } = req.body;
    
    if (!username || username.length < 3) {
        return res.status(400).json({ success: false, error: 'Username minimal 3 karakter' });
    }
    if (!password || password.length < 6) {
        return res.status(400).json({ success: false, error: 'Password minimal 6 karakter' });
    }
    if (!email && !phone) {
        return res.status(400).json({ success: false, error: 'Email atau Nomor HP harus diisi' });
    }
    if (email && !email.includes('@')) {
        return res.status(400).json({ success: false, error: 'Format email tidak valid' });
    }
    
    try {
        await connectDB();
        
        const existingUser = await usersCollection.findOne({
            $or: [
                { username },
                ...(email ? [{ email }] : []),
                ...(phone ? [{ phone }] : [])
            ]
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
        
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const newUser = {
            username,
            email: email || null,
            phone: phone || null,
            password: hashedPassword,
            name: username,
            role: 'user',
            provider: 'local',
            verified: false,
            createdAt: new Date()
        };
        
        const result = await usersCollection.insertOne(newUser);
        
        res.json({
            success: true,
            message: 'Registrasi berhasil! Silakan verifikasi email Anda.',
            user: {
                id: result.insertedId,
                username,
                email,
                phone,
                role: 'user',
                verified: false
            }
        });
        
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ success: false, error: 'Registrasi gagal: ' + error.message });
    }
});

// 4. Login (local)
app.post('/api/login', async (req, res) => {
    const { identifier, password } = req.body;
    
    try {
        await connectDB();
        
        const user = await usersCollection.findOne({
            $or: [
                { email: identifier },
                { phone: identifier },
                { username: identifier }
            ]
        });
        
        if (!user) {
            return res.status(401).json({ success: false, error: 'Email/Username/HP atau Password salah' });
        }
        
        // Cek provider
        if (user.provider === 'google') {
            return res.status(400).json({ 
                success: false, 
                error: 'Akun ini menggunakan Google Login. Silakan login dengan Google.' 
            });
        }
        
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.status(401).json({ success: false, error: 'Email/Username/HP atau Password salah' });
        }
        
        if (!user.verified) {
            return res.status(403).json({ 
                success: false, 
                error: 'Akun belum diverifikasi! Silakan cek email Anda untuk verifikasi.',
                needVerification: true,
                email: user.email
            });
        }
        
        const token = jwt.sign(
            { 
                id: user._id, 
                email: user.email, 
                name: user.name, 
                username: user.username, 
                picture: user.picture, 
                role: user.role, 
                verified: user.verified 
            },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                username: user.username,
                name: user.name,
                email: user.email,
                phone: user.phone,
                picture: user.picture,
                role: user.role,
                provider: user.provider,
                verified: user.verified
            },
            redirect: user.role === 'admin' ? '/admin/dashboard' : '/dashboard'
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, error: 'Server error: ' + error.message });
    }
});

// 5. Get Profile
app.get('/api/profile', authMiddleware, async (req, res) => {
    try {
        await connectDB();
        const user = await usersCollection.findOne(
            { _id: new ObjectId(req.userId) },
            { projection: { password: 0 } }
        );
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        res.json({
            success: true,
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                username: user.username,
                phone: user.phone,
                picture: user.picture,
                provider: user.provider,
                role: user.role,
                verified: user.verified,
                createdAt: user.createdAt
            }
        });
        
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// 6. Send Verification OTP
app.post('/api/send-verification-otp', async (req, res) => {
    const { email } = req.body;
    
    try {
        await connectDB();
        const user = await usersCollection.findOne({ email });
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'Email tidak terdaftar' });
        }
        if (user.verified) {
            return res.status(400).json({ success: false, message: 'Akun sudah terverifikasi' });
        }
        
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        
        await otpsCollection.deleteMany({ email, type: 'verification' });
        await otpsCollection.insertOne({
            email,
            code: otp,
            type: 'verification',
            expiresAt,
            attempts: 0,
            createdAt: new Date()
        });
        
        console.log(`📧 Verification OTP untuk ${email}: ${otp}`);
        
        await transporter.sendMail({
            from: `"Rulzz Official" <${EMAIL_USER}>`,
            to: email,
            subject: '✅ Verifikasi Email - Rulzz Official',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #2563eb;">Verifikasi Email</h2>
                    <p>Halo <strong>${user.name}</strong>,</p>
                    <p>Terima kasih telah mendaftar. Gunakan kode OTP berikut untuk memverifikasi email Anda:</p>
                    <div style="background: #f5f5f5; padding: 20px; text-align: center;">
                        <h1 style="color: #2563eb; font-size: 42px;">${otp}</h1>
                    </div>
                    <p>Kode berlaku 10 menit.</p>
                    <p>Jika Anda tidak melakukan pendaftaran, abaikan email ini.</p>
                </div>
            `
        });
        
        res.json({ success: true, message: 'Kode OTP verifikasi telah dikirim' });
        
    } catch (error) {
        console.error('Send verification OTP error:', error);
        res.status(500).json({ success: false, message: 'Gagal mengirim OTP' });
    }
});

// 7. Verify Email
app.post('/api/verify-email', async (req, res) => {
    const { email, otp } = req.body;
    
    try {
        await connectDB();
        const otpData = await otpsCollection.findOne({ email, code: otp, type: 'verification' });
        
        if (!otpData) {
            return res.status(400).json({ success: false, message: 'Kode OTP salah. Silakan coba lagi.' });
        }
        
        if (new Date() > otpData.expiresAt) {
            await otpsCollection.deleteOne({ _id: otpData._id });
            return res.status(400).json({ success: false, message: 'Kode OTP sudah kadaluarsa' });
        }
        
        await usersCollection.updateOne({ email }, { $set: { verified: true } });
        await otpsCollection.deleteOne({ _id: otpData._id });
        
        console.log(`✅ Email verified: ${email}`);
        
        res.json({ success: true, message: 'Email berhasil diverifikasi! Silakan login.' });
        
    } catch (error) {
        console.error('Verify email error:', error);
        res.status(500).json({ success: false, message: 'Verifikasi gagal' });
    }
});

// 8. Resend Verification OTP
app.post('/api/resend-verification', async (req, res) => {
    const { email } = req.body;
    
    try {
        await connectDB();
        const user = await usersCollection.findOne({ email });
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'Email tidak terdaftar' });
        }
        if (user.verified) {
            return res.status(400).json({ success: false, message: 'Akun sudah terverifikasi' });
        }
        
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        
        await otpsCollection.deleteMany({ email, type: 'verification' });
        await otpsCollection.insertOne({
            email,
            code: otp,
            type: 'verification',
            expiresAt,
            attempts: 0,
            createdAt: new Date()
        });
        
        await transporter.sendMail({
            from: `"Rulzz Official" <${EMAIL_USER}>`,
            to: email,
            subject: '✅ Verifikasi Email - Rulzz Official',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #2563eb;">Verifikasi Email</h2>
                    <p>Halo <strong>${user.name}</strong>,</p>
                    <p>Kode OTP verifikasi Anda:</p>
                    <div style="background: #f5f5f5; padding: 20px; text-align: center;">
                        <h1 style="color: #2563eb; font-size: 42px;">${otp}</h1>
                    </div>
                    <p>Kode berlaku 10 menit.</p>
                </div>
            `
        });
        
        res.json({ success: true, message: 'Kode OTP baru telah dikirim' });
        
    } catch (error) {
        console.error('Resend verification error:', error);
        res.status(500).json({ success: false, message: 'Gagal mengirim ulang OTP' });
    }
});

// 9. Forgot Password - Kirim OTP
app.post('/api/forgot-password', async (req, res) => {
    const { email } = req.body;
    
    try {
        await connectDB();
        const user = await usersCollection.findOne({ email });
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'Email tidak terdaftar' });
        }
        
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        
        await otpsCollection.deleteMany({ email, type: 'reset' });
        await otpsCollection.insertOne({
            email,
            code: otp,
            type: 'reset',
            expiresAt,
            attempts: 0,
            createdAt: new Date()
        });
        
        console.log(`📧 Reset OTP untuk ${email}: ${otp}`);
        
        await transporter.sendMail({
            from: `"Rulzz Official" <${EMAIL_USER}>`,
            to: email,
            subject: '🔐 Reset Password - Rulzz Official',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #2563eb;">Reset Password</h2>
                    <p>Halo <strong>${user.name}</strong>,</p>
                    <p>Kode OTP Anda:</p>
                    <div style="background: #f5f5f5; padding: 20px; text-align: center;">
                        <h1 style="color: #2563eb; font-size: 42px;">${otp}</h1>
                    </div>
                    <p>Kode berlaku 10 menit.</p>
                </div>
            `
        });
        
        res.json({ success: true, message: 'Kode OTP telah dikirim ke email Anda' });
        
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ success: false, message: 'Gagal mengirim OTP' });
    }
});

// 10. Verify OTP (for reset password)
app.post('/api/verify-otp', async (req, res) => {
    const { email, otp } = req.body;
    
    try {
        await connectDB();
        const otpData = await otpsCollection.findOne({ email, code: otp, type: 'reset' });
        
        if (!otpData) {
            return res.status(400).json({ success: false, message: 'Kode OTP salah. Silakan coba lagi.' });
        }
        
        if (new Date() > otpData.expiresAt) {
            await otpsCollection.deleteOne({ _id: otpData._id });
            return res.status(400).json({ success: false, message: 'Kode OTP sudah kadaluarsa' });
        }
        
        await otpsCollection.deleteOne({ _id: otpData._id });
        
        res.json({
            success: true,
            message: 'OTP valid',
            resetToken: 'reset-token-' + Date.now()
        });
        
    } catch (error) {
        console.error('Verify OTP error:', error);
        res.status(500).json({ success: false, message: 'Verifikasi gagal' });
    }
});

// 11. Reset Password
app.post('/api/reset-password', async (req, res) => {
    const { email, newPassword } = req.body;
    
    try {
        await connectDB();
        
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        const result = await usersCollection.updateOne(
            { email },
            { $set: { password: hashedPassword } }
        );
        
        if (result.matchedCount === 0) {
            return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
        }
        
        res.json({ success: true, message: 'Password berhasil direset' });
        
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ success: false, message: 'Reset password gagal' });
    }
});

// 12. Check User (for forgot password flow)
app.post('/api/check-user', async (req, res) => {
    const { identifier } = req.body;
    
    try {
        await connectDB();
        const user = await usersCollection.findOne({
            $or: [
                { email: identifier },
                { phone: identifier },
                { username: identifier }
            ]
        });
        
        res.json({
            exists: !!user,
            user: user ? { name: user.name, email: user.email, username: user.username, verified: user.verified } : null
        });
        
    } catch (error) {
        console.error('Check user error:', error);
        res.status(500).json({ exists: false, user: null });
    }
});

// 13. Logout
app.post('/api/logout', (req, res) => {
    res.json({ success: true, message: 'Logout berhasil' });
});

// 14. Health Check
app.get('/api/health', async (req, res) => {
    try {
        await connectDB();
        const userCount = await usersCollection.countDocuments();
        res.json({ status: 'OK', users: userCount, timestamp: new Date() });
    } catch (error) {
        res.json({ status: 'ERROR', error: error.message });
    }
});

// 15. Serve Static HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'register.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// ==================== START SERVER ====================
const PORT = process.env.PORT || 5000;
connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`
    ╔════════════════════════════════════════╗
    ║   🚀 Rulzz Official Server Running     ║
    ╠════════════════════════════════════════╣
    ║  URL: http://localhost:${PORT}          ║
    ║  Google OAuth: ✅ Configured            ║
    ║  MongoDB: ✅ Connected                  ║
    ╚════════════════════════════════════════╝
        `);
    });
});