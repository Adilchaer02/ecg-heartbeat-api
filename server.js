const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

// Load environment variables first
require('dotenv').config();

// Debug environment variables
console.log('🔍 Environment Debug:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);
console.log('PORT:', process.env.PORT);

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Database connection with better debugging
let pool;
let databaseStatus = 'not configured';

if (process.env.DATABASE_URL) {
    try {
        console.log('✅ DATABASE_URL found, creating pool...');
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        });
        
        databaseStatus = 'configured';
        console.log('✅ Database pool created successfully');
        
        // Test connection
        pool.on('connect', () => {
            console.log('✅ Connected to PostgreSQL database');
            databaseStatus = 'connected';
        });
        
        pool.on('error', (err) => {
            console.error('❌ Database connection error:', err);
            databaseStatus = 'error';
        });
        
    } catch (error) {
        console.error('❌ Failed to create database pool:', error);
        databaseStatus = 'error';
    }
} else {
    console.log('❌ DATABASE_URL not found in environment variables');
    databaseStatus = 'not configured';
}

// Helper function to check database connection
async function checkDatabaseConnection() {
    if (!pool) {
        return false;
    }
    try {
        const client = await pool.connect();
        client.release();
        return true;
    } catch (error) {
        console.error('Database connection check failed:', error);
        return false;
    }
}

// ============================================
// TEST ROUTES
// ============================================

// Test endpoint with detailed debug
app.get('/api/test', (req, res) => {
    res.json({
        message: 'ECG Heartbeat Backend API is working!',
        timestamp: new Date().toISOString(),
        status: 'success',
        version: '1.0.0',
        database: databaseStatus,
        debug: {
            NODE_ENV: process.env.NODE_ENV,
            DATABASE_URL_EXISTS: !!process.env.DATABASE_URL,
            PORT: process.env.PORT || 'not set'
        }
    });
});

// Health check with database status
app.get('/health', async (req, res) => {
    const dbConnected = await checkDatabaseConnection();
    const actualDbStatus = dbConnected ? 'connected' : (pool ? 'configured but not connected' : 'not configured');
    
    res.json({
        status: 'OK',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        database: actualDbStatus,
        debug: {
            pool_exists: !!pool,
            env_exists: !!process.env.DATABASE_URL
        }
    });
});

// ============================================
// AUTH ROUTES
// ============================================

// Register endpoint
app.post('/api/auth/register', async (req, res) => {
    if (!pool) {
        return res.status(500).json({
            success: false,
            message: 'Database not configured'
        });
    }

    let client;
    try {
        const { username, password, age, gender } = req.body;

        if (!username || !password || !age || !gender) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        client = await pool.connect();

        // Check if username exists
        const existingUser = await client.query(
            'SELECT id FROM users WHERE username = $1',
            [username]
        );

        if (existingUser.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Username sudah digunakan'
            });
        }

        // Insert new user
        const result = await client.query(
            'INSERT INTO users (username, password, age, gender) VALUES ($1, $2, $3, $4) RETURNING id, username, age, gender',
            [username, password, age, gender]
        );

        res.status(201).json({
            success: true,
            message: 'User berhasil didaftarkan',
            user: result.rows[0]
        });

    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during registration',
            debug: error.message
        });
    } finally {
        if (client) client.release();
    }
});

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
    if (!pool) {
        return res.status(500).json({
            success: false,
            message: 'Database not configured'
        });
    }

    let client;
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username and password are required'
            });
        }

        client = await pool.connect();

        // Find user
        const result = await client.query(
            'SELECT * FROM users WHERE username = $1 AND password = $2',
            [username, password]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Username atau password salah'
            });
        }

        const user = result.rows[0];
        const token = `token_${user.id}_${Date.now()}`;

        res.json({
            success: true,
            message: 'Login berhasil',
            token: token,
            user: {
                id: user.id,
                username: user.username,
                age: user.age,
                gender: user.gender
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during login',
            debug: error.message
        });
    } finally {
        if (client) client.release();
    }
});

// ============================================
// USERS ROUTES
// ============================================

// Get all users
app.get('/api/users/all', async (req, res) => {
    if (!pool) {
        return res.status(500).json({
            success: false,
            message: 'Database not configured',
            users: [],
            count: 0
        });
    }

    let client;
    try {
        client = await pool.connect();
        
        const result = await client.query(
            'SELECT id, username, password, age, gender, created_at, updated_at FROM users ORDER BY created_at DESC'
        );

        res.json({
            success: true,
            message: 'Users retrieved successfully',
            users: result.rows,
            count: result.rows.length
        });

    } catch (error) {
        console.error('Get all users error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching users',
            users: [],
            count: 0,
            debug: error.message
        });
    } finally {
        if (client) client.release();
    }
});

// ============================================
// PROFILE ROUTES
// ============================================

// Get user profile
app.get('/api/profile/:userId', async (req, res) => {
    if (!pool) {
        return res.status(500).json({
            success: false,
            message: 'Database not configured'
        });
    }

    let client;
    try {
        const { userId } = req.params;
        client = await pool.connect();

        const result = await client.query(
            'SELECT id, username, age, gender, created_at, updated_at FROM users WHERE id = $1',
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            message: 'Profile retrieved successfully',
            user: result.rows[0]
        });

    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching profile',
            debug: error.message
        });
    } finally {
        if (client) client.release();
    }
});

// ============================================
// ECG ROUTES
// ============================================

// Save ECG result
app.post('/api/ecg/save', async (req, res) => {
    if (!pool) {
        return res.status(500).json({
            success: false,
            message: 'Database not configured'
        });
    }

    let client;
    try {
        const { userId, username, bpm } = req.body;

        if (!userId || !username || !bpm) {
            return res.status(400).json({
                success: false,
                message: 'User ID, username, and BPM are required'
            });
        }

        // Determine status
        let status, kondisi;
        if (bpm < 60) {
            status = 'Abnormal';
            kondisi = 'Bradikardia - detak jantung rendah (<60 BPM)';
        } else if (bpm > 100) {
            status = 'Abnormal';
            kondisi = 'Takikardia - detak jantung tinggi (>100 BPM)';
        } else {
            status = 'Normal';
            kondisi = 'Detak jantung dalam rentang normal (60-100 BPM)';
        }

        const now = new Date();
        const waktu = now.toTimeString().split(' ')[0];

        client = await pool.connect();

        const result = await client.query(
            `INSERT INTO ecg_results (user_id, username, tanggal, waktu, bpm, status, kondisi) 
             VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6) 
             RETURNING *`,
            [userId, username, waktu, bpm, status, kondisi]
        );

        res.status(201).json({
            success: true,
            message: 'ECG result saved successfully',
            result: result.rows[0]
        });

    } catch (error) {
        console.error('Save ECG error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while saving ECG result',
            debug: error.message
        });
    } finally {
        if (client) client.release();
    }
});

// ============================================
// ERROR HANDLERS
// ============================================

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found',
        path: req.originalUrl
    });
});

// Error handler
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        debug: error.message
    });
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 ECG Heartbeat Backend running on port ${PORT}`);
    console.log(`📍 Test URL: http://localhost:${PORT}/api/test`);
    console.log(`🏥 Health Check: http://localhost:${PORT}/health`);
    console.log(`🗄️ Database URL: ${databaseStatus}`);
    console.log(`📱 Ready for requests!`);
});