const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// ==================== DATA USER ====================
const users = [
    {
        id: 1,
        username: 'admin',
        email: 'admin@aryastore.com',
        password: 'admin123',
        name: 'Admin Arya',
        phone: '081234567890',
        role: 'admin',
        createdAt: '2024-01-01T00:00:00.000Z'
    },
    {
        id: 2,
        username: 'user',
        email: 'user@aryastore.com',
        password: 'user123',
        name: 'User Biasa',
        phone: '081298765432',
        role: 'user',
        createdAt: '2024-01-01T00:00:00.000Z'
    },
    {
        id: 3,
        username: 'rulzz',
        email: 'khoirull1841@gmail.com',
        password: 'rulzz123',
        name: 'Rulzz Test',
        phone: '081255555555',
        role: 'user',
        createdAt: '2024-01-01T00:00:00.000Z'
    }
];

// Simpan OTP sementara (untuk reset password)
const otpStore = new Map();

// ==================== KONFIGURASI SMTP GMAIL ====================
// GANTI DENGAN DATA GMAIL ANDA!
const EMAIL_USER = 'rulzzofficial628@gmail.com';      // Ganti dengan email Gmail Anda
const EMAIL_PASS = 'ivqh ufzo ebvv hsad';      // Ganti dengan App Password Gmail Anda

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS,
    },
    tls: {
        rejectUnauthorized: false
    }
});

transporter.verify((error, success) => {
    if (error) {
        console.log('❌ SMTP GAGAL TERHUBUNG!');
        console.log('Error:', error.message);
    } else {
        console.log('✅ SMTP Gmail Siap! Email terhubung:', EMAIL_USER);
    }
});

// ==================== API ENDPOINTS ====================

// 1. Login
app.post('/api/login', (req, res) => {
    const { identifier, password, rememberMe } = req.body;
    
    const user = users.find(u => 
        u.email === identifier || 
        u.phone === identifier ||
        u.username === identifier
    );
    
    if (user && user.password === password) {
        res.json({
            success: true,
            message: 'Login berhasil',
            user: {
                id: user.id,
                username: user.username,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role
            },
            redirect: user.role === 'admin' ? '/admin/dashboard' : '/dashboard'
        });
    } else {
        res.status(401).json({
            success: false,
            error: 'Email/Username/HP atau Password salah'
        });
    }
});

// 2. Register
app.post('/api/register', (req, res) => {
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
    
    const existingUsername = users.find(u => u.username === username);
    if (existingUsername) {
        return res.status(400).json({ success: false, error: 'Username sudah terdaftar' });
    }
    
    if (email) {
        const existingEmail = users.find(u => u.email === email);
        if (existingEmail) {
            return res.status(400).json({ success: false, error: 'Email sudah terdaftar' });
        }
    }
    
    if (phone) {
        const existingPhone = users.find(u => u.phone === phone);
        if (existingPhone) {
            return res.status(400).json({ success: false, error: 'Nomor HP sudah terdaftar' });
        }
    }
    
    const newId = users.length + 1;
    const newUser = {
        id: newId,
        username: username,
        email: email || null,
        phone: phone || null,
        password: password,
        name: username,
        role: 'user',
        createdAt: new Date().toISOString()
    };
    
    users.push(newUser);
    
    res.json({
        success: true,
        message: 'Registrasi berhasil! Silakan login.',
        user: {
            id: newUser.id,
            username: newUser.username,
            email: newUser.email,
            phone: newUser.phone,
            role: newUser.role
        }
    });
});

// 3. Check User (untuk forgot password)
app.post('/api/check-user', (req, res) => {
    const { identifier } = req.body;
    
    const user = users.find(u => 
        u.email === identifier || 
        u.phone === identifier ||
        u.username === identifier
    );
    
    res.json({
        exists: !!user,
        user: user ? { name: user.name, email: user.email, username: user.username } : null
    });
});

// 4. Forgot Password - Kirim OTP
app.post('/api/forgot-password', async (req, res) => {
    const { email } = req.body;
    
    const user = users.find(u => u.email === email);
    
    if (!user) {
        return res.status(404).json({
            success: false,
            message: 'Email tidak terdaftar dalam sistem kami.'
        });
    }
    
    // Generate OTP 6 digit
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 menit
    
    otpStore.set(email, {
        code: otp,
        expiresAt: expiresAt,
        attempts: 0
    });
    
    console.log(`📧 OTP untuk ${email}: ${otp}`);
    
    try {
        const mailOptions = {
            from: `"Arya Store" <${EMAIL_USER}>`,
            to: email,
            subject: '🔐 Reset Password - Arya Store',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <div style="width: 60px; height: 60px; background: linear-gradient(145deg, #667eea, #764ba2); border-radius: 15px; display: inline-flex; align-items: center; justify-content: center;">
                            <span style="color: white; font-size: 30px;">🛍️</span>
                        </div>
                        <h2 style="color: #333; margin-top: 15px;">Arya Store</h2>
                    </div>
                    
                    <h3 style="color: #667eea;">Reset Password</h3>
                    <p>Halo <strong>${user.name}</strong>,</p>
                    <p>Kami menerima permintaan untuk mereset password akun Anda. Gunakan kode OTP berikut:</p>
                    
                    <div style="background-color: #f5f5f5; padding: 20px; text-align: center; border-radius: 10px; margin: 25px 0;">
                        <h1 style="color: #667eea; font-size: 42px; letter-spacing: 8px; margin: 0;">${otp}</h1>
                    </div>
                    
                    <p>Kode ini berlaku selama <strong>10 menit</strong>.</p>
                    <p>Jika Anda tidak meminta reset password, abaikan email ini.</p>
                    
                    <hr style="margin: 20px 0;">
                    <p style="color: #666; font-size: 12px;">Email ini dikirim otomatis oleh sistem Arya Store.</p>
                </div>
            `,
            text: `Kode OTP reset password Anda adalah: ${otp}. Kode ini berlaku 10 menit.`
        };
        
        await transporter.sendMail(mailOptions);
        
        res.json({
            success: true,
            message: 'Kode OTP telah dikirim ke email Anda.'
        });
        
    } catch (error) {
        console.error('Gagal kirim email:', error.message);
        res.status(500).json({
            success: false,
            message: 'Gagal mengirim email. Coba lagi nanti.'
        });
    }
});

// 5. Verify OTP
app.post('/api/verify-otp', (req, res) => {
    const { email, otp } = req.body;
    
    const storedData = otpStore.get(email);
    
    if (!storedData) {
        return res.status(400).json({
            success: false,
            message: 'OTP tidak ditemukan. Silakan minta kode baru.'
        });
    }
    
    if (Date.now() > storedData.expiresAt) {
        otpStore.delete(email);
        return res.status(400).json({
            success: false,
            message: 'Kode OTP sudah kadaluarsa. Silakan minta kode baru.'
        });
    }
    
    if (storedData.code === otp) {
        otpStore.delete(email);
        
        res.json({
            success: true,
            message: 'OTP valid. Silakan buat password baru.',
            resetToken: 'reset-token-' + Date.now()
        });
    } else {
        storedData.attempts++;
        otpStore.set(email, storedData);
        
        const attemptsLeft = 3 - storedData.attempts;
        res.status(400).json({
            success: false,
            message: `Kode OTP salah. Sisa ${attemptsLeft} percobaan.`
        });
    }
});

// 6. Reset Password
app.post('/api/reset-password', (req, res) => {
    const { email, newPassword } = req.body;
    
    const userIndex = users.findIndex(u => u.email === email);
    
    if (userIndex === -1) {
        return res.status(404).json({
            success: false,
            message: 'User tidak ditemukan.'
        });
    }
    
    users[userIndex].password = newPassword;
    
    console.log(`✅ Password berhasil direset untuk: ${email}`);
    
    res.json({
        success: true,
        message: 'Password berhasil direset. Silakan login dengan password baru.'
    });
});

// 7. Serve halaman
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'register.html'));
});

// 8. Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date(),
        usersCount: users.length
    });
});

// ==================== START SERVER ====================
app.listen(PORT, () => {
    console.log(`
    ╔════════════════════════════════════════╗
    ║     🚀 Arya Store Server Running       ║
    ╠════════════════════════════════════════╣
    ║  URL: http://localhost:${PORT}          ║
    ║  SMTP: ${EMAIL_USER !== 'emailanda@gmail.com' ? '✅ Configured' : '⚠️  Ganti EMAIL_USER dulu!'}
    ║  Users: ${users.length} user terdaftar    ║
    ╚════════════════════════════════════════╝
    `);
    
    console.log('\n📋 Daftar Akun Demo:');
    users.forEach(u => {
        console.log(`   - ${u.username} (${u.email || u.phone}) / ${u.password}`);
    });
    console.log('\n💡 Fitur OTP sudah aktif!');
    console.log('   Klik "Lupa Kata Sandi" untuk mencoba reset password via OTP email\n');
});