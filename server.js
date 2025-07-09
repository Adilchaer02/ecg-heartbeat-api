const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Debug port info
console.log('🔍 STARTUP DEBUG:');
console.log('PORT:', process.env.PORT);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);

// Database connection
let pool;
let databaseStatus = 'not configured';

if (process.env.DATABASE_URL) {
    try {
        console.log('✅ Creating database pool...');
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        });
        
        databaseStatus = 'configured';
        console.log('✅ Database pool created');
        
        // Test connection
        pool.on('connect', () => {
            console.log('✅ Database connected');
            databaseStatus = 'connected';
        });
        
        pool.on('error', (err) => {
            console.error('❌ Database error:', err);
            databaseStatus = 'error';
        });
        
    } catch (error) {
        console.error('❌ Database pool creation failed:', error);
        databaseStatus = 'error';
    }
} else {
    console.log('❌ DATABASE_URL not found');
}

// Helper function
async function checkDatabaseConnection() {
    if (!pool) return false;
    try {
        const client = await pool.connect();
        client.release();
        return true;
    } catch (error) {
        console.error('Database check failed:', error);
        return false;
    }
}

// ============================================
// BASIC ROUTES
// ============================================

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'ECG Heartbeat API',
        status: 'running',
        version: '1.0.0',
        database: databaseStatus,
        endpoints: [
            'GET /api/test',
            'GET /health',
            'GET /api/users/all',
            'POST /api/auth/register',
            'POST /api/auth/login',
            'POST /api/ecg/save'
        ]
    });
});

// Test endpoint
app.get('/api/test', (req, res) => {
    res.json({
        message: 'ECG Heartbeat API is working!',
        timestamp: new Date().toISOString(),
        status: 'success',
        version: '1.0.0',
        database: databaseStatus,
        port: {
            env_port: process.env.PORT,
            listening_port: PORT
        }
    });
});

// Health check
app.get('/health', async (req, res) => {
    const dbConnected = await checkDatabaseConnection();
    const actualDbStatus = dbConnected ? 'connected' : (pool ? 'configured but not connected' : 'not configured');
    
    res.json({
        status: 'OK',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        database: actualDbStatus,
        port: PORT
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

        // Validation
        if (!username || !password || !age || !gender) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        client = await pool.connect();

        // Check username exists
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

// Get all users (for Android dynamic validation)
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

// Update profile
app.put('/api/profile/update', async (req, res) => {
    if (!pool) {
        return res.status(500).json({
            success: false,
            message: 'Database not configured'
        });
    }

    let client;
    try {
        const { userId, username, age, gender, password } = req.body;

        if (!userId || !username || !age || !gender) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        client = await pool.connect();

        // Check username exists
        const existingUser = await client.query(
            'SELECT id FROM users WHERE username = $1 AND id != $2',
            [username, userId]
        );

        if (existingUser.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Username already exists'
            });
        }

        // Update user
        let query, params;
        if (password) {
            query = `UPDATE users SET username = $1, age = $2, gender = $3, password = $4, updated_at = CURRENT_DATE 
                     WHERE id = $5 RETURNING id, username, age, gender, updated_at`;
            params = [username, age, gender, password, userId];
        } else {
            query = `UPDATE users SET username = $1, age = $2, gender = $3, updated_at = CURRENT_DATE 
                     WHERE id = $4 RETURNING id, username, age, gender, updated_at`;
            params = [username, age, gender, userId];
        }

        const result = await client.query(query, params);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            message: 'Profile updated successfully',
            user: result.rows[0]
        });

    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while updating profile',
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

        // Determine status and condition
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

// Get ECG history
app.get('/api/ecg/history/:userId', async (req, res) => {
    if (!pool) {
        return res.status(500).json({
            success: false,
            message: 'Database not configured',
            data: [],
            count: 0
        });
    }

    let client;
    try {
        const { userId } = req.params;
        client = await pool.connect();

        const result = await client.query(
            'SELECT * FROM ecg_results WHERE user_id = $1 ORDER BY tanggal DESC, waktu DESC',
            [userId]
        );

        res.json({
            success: true,
            message: 'ECG history retrieved successfully',
            data: result.rows,
            count: result.rows.length
        });

    } catch (error) {
        console.error('Get ECG history error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching ECG history',
            data: [],
            count: 0,
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
        path: req.originalUrl,
        available_endpoints: [
            'GET /',
            'GET /api/test',
            'GET /health',
            'GET /api/users/all',
            'POST /api/auth/register',
            'POST /api/auth/login'
        ]
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

const server = app.listen(PORT, '0.0.0.0', (err) => {
    if (err) {
        console.error('❌ Server failed to start:', err);
        process.exit(1);
    }
    
    console.log(`🚀 ECG Heartbeat API started successfully`);
    console.log(`📍 Port: ${PORT}`);
    console.log(`🌐 Host: 0.0.0.0`);
    console.log(`🗄️ Database: ${databaseStatus}`);
    console.log(`✅ Server ready for connections`);
});

// Handle server errors
server.on('error', (err) => {
    console.error('❌ Server error:', err);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('🛑 Received SIGINT');
    server.close(() => {
        console.log('✅ Server closed gracefully');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('🛑 Received SIGTERM');
    server.close(() => {
        console.log('✅ Server closed gracefully');
        process.exit(0);
    });
});