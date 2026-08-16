// ==============================================================================
// FILE: app.js
// CHUNK: 1 / 5 (Core Setup, Security Configuration, Utility Functions & Auth Middleware)
// ==============================================================================

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');

// ------------------------------------------------------------------------------
// 1. ENVIRONMENT CONFIGURATION & SETUP
// ------------------------------------------------------------------------------
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';
const JWT_SECRET = process.env.JWT_SECRET || 'app_super_secure_jwt_secret_key_2026_prod';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Ensure required public and uploads directories exist
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const PDF_TEMP_DIR = path.join(__dirname, 'temp_pdfs');
const PUBLIC_DIR = path.join(__dirname, 'public');

[UPLOAD_DIR, PDF_TEMP_DIR, PUBLIC_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`[SYSTEM INIT] Created Directory: ${dir}`);
  }
});

// ------------------------------------------------------------------------------
// 2. SUPABASE DATABASE INITIALIZATION
// ------------------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('================================================================');
  console.error('FATAL ERROR: SUPABASE_URL or SUPABASE_KEY is missing in process.env!');
  console.error('Please configure your .env file correctly.');
  console.error('================================================================');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  db: {
    schema: 'public',
  },
});

console.log('[SUPABASE INIT] Successfully connected to Supabase Client.');

// ------------------------------------------------------------------------------
// 3. SECURITY & GLOBAL MIDDLEWARES
// ------------------------------------------------------------------------------
app.set('trust proxy', 1);

// Security Headers via Helmet
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        connectSrc: ["'self'", SUPABASE_URL, 'wss:', 'https:'],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// Gzip Compression
app.use(compression());

// CORS Configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://localhost:5000', 'http://127.0.0.1:5000'];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || NODE_ENV === 'development') {
        callback(null, true);
      } else {
        callback(new Error('CORS Policy: Access Blocked by Security Policies'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Api-Key'],
    credentials: true,
  })
);

// Body Parsers
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Request Logging
if (NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Serve Static Files
app.use(express.static(PUBLIC_DIR));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/temp_pdfs', express.static(PDF_TEMP_DIR));

// Rate Limiting Config
const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 429,
    error: 'Too Many Requests',
    message: 'Too many requests from this IP address, please try again after 15 minutes.',
  },
});

const authRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: {
    status: 429,
    error: 'Auth Rate Limit Exceeded',
    message: 'Too many failed login/signup attempts. Please try again after 1 hour.',
  },
});

app.use('/api/', apiRateLimiter);

// Custom Request Timestamp Decorator
app.use((req, res, next) => {
  req.requestTime = new Date().toISOString();
  req.uniqueId = crypto.randomUUID();
  res.setHeader('X-Request-ID', req.uniqueId);
  next();
});

// ------------------------------------------------------------------------------
// 4. UTILITY & HELPER FUNCTIONS
// ------------------------------------------------------------------------------

/**
 * Standardized API Response Formatter
 */
const sendResponse = (res, statusCode, success, message, data = null, meta = null) => {
  return res.status(statusCode).json({
    success,
    status: statusCode,
    message,
    data,
    meta,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Hash password securely using bcrypt
 */
const hashPassword = async (plainPassword) => {
  const salt = await bcrypt.genSalt(12);
  return await bcrypt.hash(plainPassword, salt);
};

/**
 * Compare plain password against hashed password
 */
const comparePassword = async (plainPassword, hashedPassword) => {
  return await bcrypt.compare(plainPassword, hashedPassword);
};

/**
 * Generate JWT Token for Session Management
 */
const generateJwtToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

/**
 * Sanitize user payload for response output (removes credentials)
 */
const sanitizeUser = (user) => {
  if (!user) return null;
  const { password, password_hash, secret_key, reset_token, ...safeUser } = user;
  return safeUser;
};

/**
 * Format pagination response metadata
 */
const getPaginationMeta = (page, limit, totalCount) => {
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 10;
  const totalPages = Math.ceil(totalCount / limitNum);
  
  return {
    currentPage: pageNum,
    itemsPerPage: limitNum,
    totalRecords: totalCount,
    totalPages,
    hasNextPage: pageNum < totalPages,
    hasPrevPage: pageNum > 1,
  };
};

// ------------------------------------------------------------------------------
// 5. AUTHENTICATION & AUTHORIZATION MIDDLEWARES
// ------------------------------------------------------------------------------

/**
 * Middleware: Verify JWT Access Token
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

    if (!token) {
      return sendResponse(res, 401, false, 'Access Denied: Missing Authorization Header');
    }

    jwt.verify(token, JWT_SECRET, async (err, decodedUser) => {
      if (err) {
        if (err.name === 'TokenExpiredError') {
          return sendResponse(res, 401, false, 'Authentication Failed: Token has expired');
        }
        return sendResponse(res, 403, false, 'Authentication Failed: Invalid Authorization Token');
      }

      // Fetch active user status from database via Supabase
      const { data: user, error } = await supabase
        .from('users')
        .select('id, email, username, role, is_active, created_at')
        .eq('id', decodedUser.id)
        .single();

      if (error || !user) {
        return sendResponse(res, 401, false, 'Authentication Failed: User record no longer exists');
      }

      if (!user.is_active) {
        return sendResponse(res, 403, false, 'Account Suspended: Contact administrator for support');
      }

      req.user = user;
      next();
    });
  } catch (error) {
    console.error('[AUTH MIDDLEWARE ERROR]:', error);
    return sendResponse(res, 500, false, 'Internal Authentication Processing Error');
  }
};

/**
 * Middleware: Role-Based Authorization Check
 * @param {Array<string>} allowedRoles 
 */
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return sendResponse(res, 401, false, 'Unauthorized: Authenticated user context required');
    }

    if (!allowedRoles.includes(req.user.role)) {
      return sendResponse(res, 403, false, `Forbidden: Require one of the following roles: [${allowedRoles.join(', ')}]`);
    }

    next();
  };
};

/**
 * Middleware: Optional Authentication Filter
 */
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { data: user } = await supabase
      .from('users')
      .select('id, email, username, role, is_active')
      .eq('id', decoded.id)
      .single();

    req.user = user && user.is_active ? user : null;
  } catch (e) {
    req.user = null;
  }

  next();
};

// ------------------------------------------------------------------------------
// END OF CHUNK 1/5
// ==============================================================================
// ==============================================================================
// FILE: app.js
// CHUNK: 2 / 5 (Authentication, User Management, Password Reset & Profile Handling)
// ==============================================================================

// Apply strict rate limiting to all auth endpoints
app.use('/api/v1/auth/login', authRateLimiter);
app.use('/api/v1/auth/register', authRateLimiter);

// ------------------------------------------------------------------------------
// 6. AUTHENTICATION ROUTES & CONTROLLERS
// ------------------------------------------------------------------------------

/**
 * @route   POST /api/v1/auth/register
 * @desc    Register a new user account with Supabase persistence
 * @access  Public
 */
app.post('/api/v1/auth/register', async (req, res) => {
  try {
    const { username, email, password, full_name, role } = req.body;

    // Basic Input Validation
    if (!username || !email || !password) {
      return sendResponse(res, 400, false, 'Validation Error: Username, email, and password are required');
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return sendResponse(res, 400, false, 'Validation Error: Invalid email format');
    }

    // Password strength check
    if (password.length < 8) {
      return sendResponse(res, 400, false, 'Validation Error: Password must be at least 8 characters long');
    }

    // Check if user or email already exists
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('id, email, username')
      .or(`email.eq.${email.toLowerCase()},username.eq.${username.toLowerCase()}`)
      .maybeSingle();

    if (checkError) {
      console.error('[REGISTRATION DB ERROR]:', checkError);
      return sendResponse(res, 500, false, 'Database query failure during account check');
    }

    if (existingUser) {
      if (existingUser.email === email.toLowerCase()) {
        return sendResponse(res, 409, false, 'Conflict: Email address is already registered');
      }
      return sendResponse(res, 409, false, 'Conflict: Username is already taken');
    }

    // Hash user password
    const hashedPassword = await hashPassword(password);

    // Assign default role (prevent unauthorized admin privilege escalation)
    const assignedRole = (role === 'admin' && req.user?.role === 'admin') ? 'admin' : 'user';

    const newUserPayload = {
      username: username.toLowerCase().trim(),
      email: email.toLowerCase().trim(),
      password_hash: hashedPassword,
      full_name: full_name ? full_name.trim() : null,
      role: assignedRole,
      is_active: true,
      email_verified: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Insert user record into Supabase
    const { data: createdUser, error: insertError } = await supabase
      .from('users')
      .insert([newUserPayload])
      .select('id, username, email, full_name, role, is_active, created_at')
      .single();

    if (insertError) {
      console.error('[SUPABASE INSERT USER ERROR]:', insertError);
      return sendResponse(res, 500, false, 'Failed to create user account in database');
    }

    // Generate JWT Token for seamless auto-login
    const token = generateJwtToken({
      id: createdUser.id,
      email: createdUser.email,
      role: createdUser.role
    });

    return sendResponse(res, 201, true, 'User registration successfully completed', {
      user: sanitizeUser(createdUser),
      token
    });

  } catch (error) {
    console.error('[REGISTER ROUTE EXCEPTION]:', error);
    return sendResponse(res, 500, false, 'Server Exception occurred during registration');
  }
});

/**
 * @route   POST /api/v1/auth/login
 * @desc    Authenticate user credentials and issue JWT Access Token
 * @access  Public
 */
app.post('/api/v1/auth/login', async (req, res) => {
  try {
    const { identity, password } = req.body; // identity can be email or username

    if (!identity || !password) {
      return sendResponse(res, 400, false, 'Validation Error: Please provide identity (email/username) and password');
    }

    // Lookup user by email or username
    const isEmail = identity.includes('@');
    const queryField = isEmail ? 'email' : 'username';

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq(queryField, identity.toLowerCase().trim())
      .single();

    if (error || !user) {
      return sendResponse(res, 401, false, 'Invalid Credentials: User account not found');
    }

    // Check account status
    if (!user.is_active) {
      return sendResponse(res, 403, false, 'Account Disabled: Your account has been suspended by an administrator');
    }

    // Verify Password match
    const isMatch = await comparePassword(password, user.password_hash);
    if (!isMatch) {
      return sendResponse(res, 401, false, 'Invalid Credentials: Incorrect password provided');
    }

    // Update last_login timestamp in DB asynchronously
    await supabase
      .from('users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', user.id);

    // Issue Authentication Token
    const token = generateJwtToken({
      id: user.id,
      email: user.email,
      role: user.role
    });

    return sendResponse(res, 200, true, 'Authentication successful', {
      user: sanitizeUser(user),
      token
    });

  } catch (error) {
    console.error('[LOGIN ROUTE EXCEPTION]:', error);
    return sendResponse(res, 500, false, 'Server Exception occurred during login processing');
  }
});

/**
 * @route   GET /api/v1/auth/me
 * @desc    Fetch active user profile details based on Bearer Token
 * @access  Private
 */
app.get('/api/v1/auth/me', authenticateToken, async (req, res) => {
  try {
    const { data: userProfile, error } = await supabase
      .from('users')
      .select('id, username, email, full_name, role, is_active, email_verified, last_login_at, created_at, updated_at')
      .eq('id', req.user.id)
      .single();

    if (error || !userProfile) {
      return sendResponse(res, 404, false, 'User profile record not found');
    }

    return sendResponse(res, 200, true, 'User profile retrieved successfully', {
      user: userProfile
    });
  } catch (error) {
    console.error('[AUTH ME EXCEPTION]:', error);
    return sendResponse(res, 500, false, 'Server Exception while retrieving profile');
  }
});

/**
 * @route   PUT /api/v1/auth/profile
 * @desc    Update authenticated user's profile metadata
 * @access  Private
 */
app.put('/api/v1/auth/profile', authenticateToken, async (req, res) => {
  try {
    const { full_name, phone, avatar_url } = req.body;

    const updatePayload = {
      updated_at: new Date().toISOString()
    };

    if (full_name !== undefined) updatePayload.full_name = full_name.trim();
    if (phone !== undefined) updatePayload.phone = phone.trim();
    if (avatar_url !== undefined) updatePayload.avatar_url = avatar_url.trim();

    const { data: updatedUser, error } = await supabase
      .from('users')
      .update(updatePayload)
      .eq('id', req.user.id)
      .select('id, username, email, full_name, phone, avatar_url, role, updated_at')
      .single();

    if (error) {
      console.error('[UPDATE PROFILE DB ERROR]:', error);
      return sendResponse(res, 500, false, 'Failed to update user profile details in database');
    }

    return sendResponse(res, 200, true, 'Profile details successfully updated', {
      user: updatedUser
    });
  } catch (error) {
    console.error('[UPDATE PROFILE EXCEPTION]:', error);
    return sendResponse(res, 500, false, 'Server Exception while updating profile');
  }
});

/**
 * @route   POST /api/v1/auth/change-password
 * @desc    Change password for authenticated active user
 * @access  Private
 */
app.post('/api/v1/auth/change-password', authenticateToken, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return sendResponse(res, 400, false, 'Validation Error: Current password and new password are required');
    }

    if (new_password.length < 8) {
      return sendResponse(res, 400, false, 'Validation Error: New password must be at least 8 characters');
    }

    // Fetch existing password hash from DB
    const { data: user, error } = await supabase
      .from('users')
      .select('password_hash')
      .eq('id', req.user.id)
      .single();

    if (error || !user) {
      return sendResponse(res, 404, false, 'User account record not found');
    }

    // Verify current password match
    const isMatch = await comparePassword(current_password, user.password_hash);
    if (!isMatch) {
      return sendResponse(res, 400, false, 'Authentication Failed: Current password does not match');
    }

    // Hash new password and update
    const newHashedPassword = await hashPassword(new_password);

    const { error: updateError } = await supabase
      .from('users')
      .update({
        password_hash: newHashedPassword,
        updated_at: new Date().toISOString()
      })
      .eq('id', req.user.id);

    if (updateError) {
      console.error('[CHANGE PASSWORD DB ERROR]:', updateError);
      return sendResponse(res, 500, false, 'Failed to save new password to database');
    }

    return sendResponse(res, 200, true, 'Password changed successfully');

  } catch (error) {
    console.error('[CHANGE PASSWORD EXCEPTION]:', error);
    return sendResponse(res, 500, false, 'Server Exception occurred while changing password');
  }
});

/**
 * @route   POST /api/v1/auth/request-reset
 * @desc    Request a password reset token (Initiates reset workflow)
 * @access  Public
 */
app.post('/api/v1/auth/request-reset', authRateLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return sendResponse(res, 400, false, 'Validation Error: Email address is required');
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', email.toLowerCase().trim())
      .single();

    // Generic success message to prevent user enumeration attacks
    const successMsg = 'If the email exists in our records, a password reset link has been dispatched.';

    if (error || !user) {
      return sendResponse(res, 200, true, successMsg);
    }

    // Generate secure random reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const resetExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour validity

    await supabase
      .from('users')
      .update({
        reset_token_hash: resetTokenHash,
        reset_token_expires_at: resetExpiresAt
      })
      .eq('id', user.id);

    console.log(`[PASS RESET TOKEN GENERATED] User ID: ${user.id} | Token: ${resetToken}`);

    return sendResponse(res, 200, true, successMsg, { resetToken }); // Output token for dev/testing environment

  } catch (error) {
    console.error('[REQUEST RESET EXCEPTION]:', error);
    return sendResponse(res, 500, false, 'Server Exception processing password reset request');
  }
});

/**
 * @route   POST /api/v1/auth/reset-password
 * @desc    Confirm password reset using token
 * @access  Public
 */
app.post('/api/v1/auth/reset-password', authRateLimiter, async (req, res) => {
  try {
    const { token, new_password } = req.body;

    if (!token || !new_password) {
      return sendResponse(res, 400, false, 'Validation Error: Reset token and new password are required');
    }

    if (new_password.length < 8) {
      return sendResponse(res, 400, false, 'Validation Error: New password must be at least 8 characters');
    }

    const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with matching unexpired reset token
    const { data: user, error } = await supabase
      .from('users')
      .select('id, reset_token_expires_at')
      .eq('reset_token_hash', resetTokenHash)
      .single();

    if (error || !user) {
      return sendResponse(res, 400, false, 'Invalid or expired password reset token');
    }

    // Check expiration
    if (new Date(user.reset_token_expires_at) < new Date()) {
      return sendResponse(res, 400, false, 'Reset Token Error: Password reset link has expired');
    }

    // Update password and clear reset tokens
    const newHashedPassword = await hashPassword(new_password);

    await supabase
      .from('users')
      .update({
        password_hash: newHashedPassword,
        reset_token_hash: null,
        reset_token_expires_at: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    return sendResponse(res, 200, true, 'Password reset successful! You can now log in with your new password.');

  } catch (error) {
    console.error('[RESET PASSWORD EXCEPTION]:', error);
    return sendResponse(res, 500, false, 'Server Exception while executing password reset');
  }
});

// ------------------------------------------------------------------------------
// END OF CHUNK 2/5
// ==============================================================================
// ==============================================================================
// FILE: app.js
// CHUNK: 3 / 5 (Core Data CRUD Endpoints, Filtering, Pagination & Resource Management)
// ==============================================================================

// ------------------------------------------------------------------------------
// 7. RESOURCE CRUD API ENDPOINTS (DATA MANAGEMENT ENGINE)
// ------------------------------------------------------------------------------

/**
 * @route   GET /api/v1/resources
 * @desc    Fetch paginated list of resources with searching, sorting & filtering
 * @access  Public / Optional Auth
 */
app.get('/api/v1/resources', optionalAuth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      category,
      status,
      sort_by = 'created_at',
      sort_order = 'desc',
      min_price,
      max_price
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const offset = (pageNum - 1) * limitNum;

    // Start building query with total count
    let query = supabase
      .from('resources')
      .select('*', { count: 'exact' });

    // Apply status filter (Unauthenticated users only see active/published records)
    if (!req.user || req.user.role !== 'admin') {
      query = query.eq('is_published', true);
    } else if (status) {
      query = query.eq('status', status);
    }

    // Apply Search Filter across title and description
    if (search.trim() !== '') {
      const searchTerm = `%${search.trim()}%`;
      query = query.or(`title.ilike.${searchTerm},description.ilike.${searchTerm}`);
    }

    // Category Filter
    if (category) {
      query = query.eq('category', category);
    }

    // Numeric Range Filters
    if (min_price !== undefined && !isNaN(parseFloat(min_price))) {
      query = query.gte('price', parseFloat(min_price));
    }
    if (max_price !== undefined && !isNaN(parseFloat(max_price))) {
      query = query.lte('price', parseFloat(max_price));
    }

    // Sorting Logic
    const validSortFields = ['created_at', 'updated_at', 'title', 'price', 'views_count'];
    const selectedSortField = validSortFields.includes(sort_by) ? sort_by : 'created_at';
    const isAscending = String(sort_order).toLowerCase() === 'asc';

    query = query
      .order(selectedSortField, { ascending: isAscending })
      .range(offset, offset + limitNum - 1);

    const { data: resources, count, error } = await query;

    if (error) {
      console.error('[FETCH RESOURCES DB ERROR]:', error);
      return sendResponse(res, 500, false, 'Failed to fetch resource records from database');
    }

    const paginationMeta = getPaginationMeta(pageNum, limitNum, count || 0);

    return sendResponse(
      res,
      200,
      true,
      'Resources retrieved successfully',
      resources,
      paginationMeta
    );
  } catch (error) {
    console.error('[FETCH RESOURCES EXCEPTION]:', error);
    return sendResponse(res, 500, false, 'Server Exception occurred while retrieving resources');
  }
});

/**
 * @route   GET /api/v1/resources/:id
 * @desc    Fetch single resource by ID and increment view count
 * @access  Public
 */
app.get('/api/v1/resources/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return sendResponse(res, 400, false, 'Validation Error: Resource ID parameter required');
    }

    // Fetch primary resource record
    const { data: resource, error } = await supabase
      .from('resources')
      .select('*, created_by_user:users(id, username, full_name, avatar_url)')
      .eq('id', id)
      .single();

    if (error || !resource) {
      return sendResponse(res, 404, false, 'Resource not found or has been removed');
    }

    // Asynchronously increment view counter
    supabase
      .from('resources')
      .update({ views_count: (resource.views_count || 0) + 1 })
      .eq('id', id)
      .then(({ error: viewErr }) => {
        if (viewErr) console.warn(`[VIEW COUNT ERR] ID: ${id}`, viewErr);
      });

    return sendResponse(res, 200, true, 'Resource detail fetched successfully', resource);
  } catch (error) {
    console.error('[FETCH SINGLE RESOURCE EXCEPTION]:', error);
    return sendResponse(res, 500, false, 'Server Exception fetching resource details');
  }
});

/**
 * @route   POST /api/v1/resources
 * @desc    Create a new resource item
 * @access  Private (Authenticated Users)
 */
app.post('/api/v1/resources', authenticateToken, async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      price = 0,
      tags = [],
      metadata = {},
      is_published = true
    } = req.body;

    // Field Validations
    if (!title || !category) {
      return sendResponse(res, 400, false, 'Validation Error: Title and Category are required fields');
    }

    const newResourcePayload = {
      title: title.trim(),
      slug: title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, ''),
      description: description ? description.trim() : '',
      category: category.trim(),
      price: parseFloat(price) || 0,
      tags: Array.isArray(tags) ? tags : [],
      metadata: typeof metadata === 'object' ? metadata : {},
      is_published: Boolean(is_published),
      views_count: 0,
      created_by: req.user.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: insertedResource, error } = await supabase
      .from('resources')
      .insert([newResourcePayload])
      .select()
      .single();

    if (error) {
      console.error('[CREATE RESOURCE DB ERROR]:', error);
      return sendResponse(res, 500, false, 'Failed to save resource record in database');
    }

    return sendResponse(res, 201, true, 'Resource item successfully created', insertedResource);
  } catch (error) {
    console.error('[CREATE RESOURCE EXCEPTION]:', error);
    return sendResponse(res, 500, false, 'Server Exception during resource creation');
  }
});

/**
 * @route   PUT /api/v1/resources/:id
 * @desc    Update an existing resource by ID
 * @access  Private (Owner or Admin)
 */
app.put('/api/v1/resources/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, category, price, tags, metadata, is_published } = req.body;

    // Check ownership or admin status
    const { data: existingResource, error: checkError } = await supabase
      .from('resources')
      .select('id, created_by')
      .eq('id', id)
      .single();

    if (checkError || !existingResource) {
      return sendResponse(res, 404, false, 'Resource item not found for update');
    }

    if (existingResource.created_by !== req.user.id && req.user.role !== 'admin') {
      return sendResponse(res, 403, false, 'Forbidden: You do not have permission to edit this resource');
    }

    const updatePayload = {
      updated_at: new Date().toISOString()
    };

    if (title !== undefined) {
      updatePayload.title = title.trim();
      updatePayload.slug = title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    }
    if (description !== undefined) updatePayload.description = description.trim();
    if (category !== undefined) updatePayload.category = category.trim();
    if (price !== undefined) updatePayload.price = parseFloat(price) || 0;
    if (tags !== undefined) updatePayload.tags = Array.isArray(tags) ? tags : [];
    if (metadata !== undefined) updatePayload.metadata = metadata;
    if (is_published !== undefined) updatePayload.is_published = Boolean(is_published);

    const { data: updatedResource, error: updateError } = await supabase
      .from('resources')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('[UPDATE RESOURCE DB ERROR]:', updateError);
      return sendResponse(res, 500, false, 'Failed to update resource in database');
    }

    return sendResponse(res, 200, true, 'Resource item updated successfully', updatedResource);
  } catch (error) {
    console.error('[UPDATE RESOURCE EXCEPTION]:', error);
    return sendResponse(res, 500, false, 'Server Exception occurred during resource update');
  }
});

/**
 * @route   DELETE /api/v1/resources/:id
 * @desc    Delete a resource record
 * @access  Private (Owner or Admin)
 */
app.delete('/api/v1/resources/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: existingResource, error: checkError } = await supabase
      .from('resources')
      .select('id, created_by')
      .eq('id', id)
      .single();

    if (checkError || !existingResource) {
      return sendResponse(res, 404, false, 'Resource item not found for deletion');
    }

    if (existingResource.created_by !== req.user.id && req.user.role !== 'admin') {
      return sendResponse(res, 403, false, 'Forbidden: You do not have permission to delete this resource');
    }

    const { error: deleteError } = await supabase
      .from('resources')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('[DELETE RESOURCE DB ERROR]:', deleteError);
      return sendResponse(res, 500, false, 'Failed to delete resource record from database');
    }

    return sendResponse(res, 200, true, `Resource ${id} deleted successfully`);
  } catch (error) {
    console.error('[DELETE RESOURCE EXCEPTION]:', error);
    return sendResponse(res, 500, false, 'Server Exception occurred while deleting resource');
  }
});

// ------------------------------------------------------------------------------
// 8. ADMIN DASHBOARD & USER MANAGEMENT ENDPOINTS
// ------------------------------------------------------------------------------

/**
 * @route   GET /api/v1/admin/users
 * @desc    Fetch list of all users with system management metadata
 * @access  Private (Admin Only)
 */
app.get('/api/v1/admin/users', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', role, status } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    let query = supabase
      .from('users')
      .select('id, username, email, full_name, role, is_active, last_login_at, created_at', { count: 'exact' });

    if (search.trim() !== '') {
      const searchTerm = `%${search.trim()}%`;
      query = query.or(`username.ilike.${searchTerm},email.ilike.${searchTerm},full_name.ilike.${searchTerm}`);
    }

    if (role) query = query.eq('role', role);
    if (status !== undefined) query = query.eq('is_active', status === 'active');

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limitNum - 1);

    const { data: users, count, error } = await query;

    if (error) {
      console.error('[ADMIN FETCH USERS DB ERROR]:', error);
      return sendResponse(res, 500, false, 'Failed to retrieve user list');
    }

    return sendResponse(
      res,
      200,
      true,
      'User records retrieved successfully',
      users,
      getPaginationMeta(pageNum, limitNum, count || 0)
    );
  } catch (error) {
    console.error('[ADMIN FETCH USERS EXCEPTION]:', error);
    return sendResponse(res, 500, false, 'Server Exception processing admin user list request');
  }
});

/**
 * @route   PATCH /api/v1/admin/users/:id/status
 * @desc    Toggle user active/suspended state or role update
 * @access  Private (Admin Only)
 */
app.patch('/api/v1/admin/users/:id/status', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active, role } = req.body;

    if (id === req.user.id) {
      return sendResponse(res, 400, false, 'Operation Blocked: You cannot modify your own administrative account status');
    }

    const updatePayload = { updated_at: new Date().toISOString() };
    if (is_active !== undefined) updatePayload.is_active = Boolean(is_active);
    if (role && ['user', 'admin', 'moderator'].includes(role)) updatePayload.role = role;

    const { data: updatedUser, error } = await supabase
      .from('users')
      .update(updatePayload)
      .eq('id', id)
      .select('id, username, email, role, is_active, updated_at')
      .single();

    if (error) {
      console.error('[ADMIN UPDATE USER STATUS ERROR]:', error);
      return sendResponse(res, 500, false, 'Failed to update user account settings');
    }

    return sendResponse(res, 200, true, 'User account status updated successfully', updatedUser);
  } catch (error) {
    console.error('[ADMIN UPDATE USER STATUS EXCEPTION]:', error);
    return sendResponse(res, 500, false, 'Server Exception executing admin status update');
  }
});

// ------------------------------------------------------------------------------
// END OF CHUNK 3/5
// ==============================================================================
// ==============================================================================
// FILE: app.js
// CHUNK: 4 / 5 (PDF Voucher Engine, Batch Processing & System Export Utilities)
// ==============================================================================

// ------------------------------------------------------------------------------
// 9. VOUCHER & PDF GENERATION ENGINE
// ------------------------------------------------------------------------------

/**
 * Helper: Helper function to generate PDF document buffers for Vouchers
 * @param {Object} voucherData - Detailed data required to assemble voucher document
 * @returns {Promise<Buffer>} PDF Buffer stream
 */
function createVoucherPDFBuffer(voucherData) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const buffers = [];

      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      // Header Branding Section
      doc
        .fillColor('#1E293B')
        .fontSize(22)
        .text(voucherData.company_name || 'OFFICIAL VOUCHER', 40, 40, { align: 'left' })
        .fontSize(10)
        .fillColor('#64748B')
        .text(`Voucher Ref: ${voucherData.voucher_code}`, 40, 68, { align: 'left' })
        .text(`Issued Date: ${new Date(voucherData.created_at || Date.now()).toLocaleDateString()}`, 40, 82, { align: 'left' });

      // Horizontal Divider Line
      doc
        .moveTo(40, 105)
        .lineTo(555, 105)
        .strokeColor('#CBD5E1')
        .lineWidth(1)
        .stroke();

      // Recipient & Details Box
      doc
        .rect(40, 120, 515, 90)
        .fillAndStroke('#F8FAFC', '#E2E8F0');

      doc
        .fillColor('#334155')
        .fontSize(12)
        .text('VOUCHER DETAILS', 55, 132)
        .fontSize(10)
        .fillColor('#475569')
        .text(`Customer Name: ${voucherData.customer_name || 'N/A'}`, 55, 152)
        .text(`Customer Email: ${voucherData.customer_email || 'N/A'}`, 55, 168)
        .text(`Status: ${(voucherData.status || 'ACTIVE').toUpperCase()}`, 320, 152)
        .text(`Expiry Date: ${voucherData.expiry_date ? new Date(voucherData.expiry_date).toLocaleDateString() : 'No Expiry'}`, 320, 168);

      // Main Items Table Header
      let currentY = 230;
      doc
        .rect(40, currentY, 515, 25)
        .fill('#0F172A');

      doc
        .fillColor('#FFFFFF')
        .fontSize(10)
        .text('Item / Description', 50, currentY + 7)
        .text('Qty', 350, currentY + 7, { width: 50, align: 'center' })
        .text('Amount', 420, currentY + 7, { width: 120, align: 'right' });

      currentY += 25;

      // Items Rendering Loop
      const items = Array.isArray(voucherData.items) ? voucherData.items : [];
      let totalAmount = 0;

      items.forEach((item, index) => {
        const itemPrice = parseFloat(item.price || 0);
        const itemQty = parseInt(item.quantity || 1, 10);
        const lineTotal = itemPrice * itemQty;
        totalAmount += lineTotal;

        const rowBg = index % 2 === 0 ? '#FFFFFF' : '#F1F5F9';
        doc.rect(40, currentY, 515, 22).fill(rowBg);

        doc
          .fillColor('#1E293B')
          .fontSize(9)
          .text(item.title || 'Standard Service', 50, currentY + 6, { width: 280, height: 15, ellipsis: true })
          .text(String(itemQty), 350, currentY + 6, { width: 50, align: 'center' })
          .text(`$${lineTotal.toFixed(2)}`, 420, currentY + 6, { width: 120, align: 'right' });

        currentY += 22;
      });

      // Total Summary Box
      currentY += 10;
      doc
        .moveTo(40, currentY)
        .lineTo(555, currentY)
        .strokeColor('#0F172A')
        .lineWidth(1.5)
        .stroke();

      currentY += 10;
      doc
        .fillColor('#0F172A')
        .fontSize(12)
        .text('Grand Total:', 320, currentY, { width: 100, align: 'left' })
        .text(`$${totalAmount.toFixed(2)}`, 420, currentY, { width: 120, align: 'right' });

      // Footer Terms
      doc
        .fontSize(8)
        .fillColor('#94A3B8')
        .text('Terms & Conditions: This voucher is non-transferable and must be presented upon redemption.', 40, 750, { align: 'center', width: 515 })
        .text('Generated via Automated PDF Engine - All Rights Reserved.', 40, 762, { align: 'center', width: 515 });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * @route   POST /api/v1/vouchers/generate
 * @desc    Generate a new digital voucher record & produce PDF download stream
 * @access  Private
 */
app.post('/api/v1/vouchers/generate', authenticateToken, async (req, res) => {
  try {
    const { customer_name, customer_email, items, expiry_days = 30 } = req.body;

    if (!customer_name || !items || !Array.isArray(items) || items.length === 0) {
      return sendResponse(res, 400, false, 'Validation Error: Customer name and at least 1 item required');
    }

    const voucherCode = `VCH-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + parseInt(expiry_days, 10));

    const voucherRecord = {
      voucher_code: voucherCode,
      created_by: req.user.id,
      customer_name: customer_name.trim(),
      customer_email: customer_email ? customer_email.trim() : null,
      items: items,
      status: 'active',
      expiry_date: expiryDate.toISOString(),
      created_at: new Date().toISOString()
    };

    // Save metadata in Supabase
    const { data: dbVoucher, error: dbError } = await supabase
      .from('vouchers')
      .insert([voucherRecord])
      .select()
      .single();

    if (dbError) {
      console.error('[VOUCHER GENERATE DB ERROR]:', dbError);
      return sendResponse(res, 500, false, 'Failed to log voucher record in database');
    }

    // Generate PDF document in buffer stream
    const pdfBuffer = await createVoucherPDFBuffer({
      ...dbVoucher,
      company_name: process.env.APP_NAME || 'SYSTEM ENTERPRISE'
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Voucher_${voucherCode}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    return res.status(200).send(pdfBuffer);
  } catch (error) {
    console.error('[GENERATE VOUCHER EXCEPTION]:', error);
    return sendResponse(res, 500, false, 'Server Exception occurred while generating PDF voucher');
  }
});

/**
 * @route   GET /api/v1/vouchers/:code/download
 * @desc    Download PDF version of existing voucher code
 * @access  Public / Token Protected
 */
app.get('/api/v1/vouchers/:code/download', async (req, res) => {
  try {
    const { code } = req.params;

    const { data: voucher, error } = await supabase
      .from('vouchers')
      .select('*')
      .eq('voucher_code', code)
      .single();

    if (error || !voucher) {
      return sendResponse(res, 404, false, 'Voucher code invalid or expired');
    }

    const pdfBuffer = await createVoucherPDFBuffer({
      ...voucher,
      company_name: process.env.APP_NAME || 'SYSTEM ENTERPRISE'
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Voucher_${voucher.voucher_code}.pdf"`);
    return res.status(200).send(pdfBuffer);
  } catch (error) {
    console.error('[DOWNLOAD VOUCHER EXCEPTION]:', error);
    return sendResponse(res, 500, false, 'Failed to output voucher PDF file');
  }
});

// ------------------------------------------------------------------------------
// 10. SYSTEM DATA EXPORT & BULK BATCH UTILITIES
// ------------------------------------------------------------------------------

/**
 * @route   GET /api/v1/export/csv
 * @desc    Export system data records in formatted CSV file format
 * @access  Private (Admin Only)
 */
app.get('/api/v1/export/csv', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { table = 'resources' } = req.query;
    const allowedTables = ['resources', 'vouchers', 'audit_logs'];

    if (!allowedTables.includes(table)) {
      return sendResponse(res, 400, false, 'Validation Error: Invalid table specified for CSV export');
    }

    const { data: records, error } = await supabase
      .from(table)
      .select('*')
      .limit(1000);

    if (error || !records || records.length === 0) {
      return sendResponse(res, 404, false, 'No data available to construct export file');
    }

    // Extract Headers dynamically
    const headers = Object.keys(records[0]);
    const csvRows = [];
    csvRows.push(headers.join(','));

    // Process rows with proper string escaping
    records.forEach((row) => {
      const values = headers.map((header) => {
        const val = row[header];
        if (val === null || val === undefined) return '""';
        if (typeof val === 'object') return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
        return `"${String(val).replace(/"/g, '""')}"`;
      });
      csvRows.push(values.join(','));
    });

    const csvContent = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="export_${table}_${Date.now()}.csv"`);
    return res.status(200).send(csvContent);
  } catch (error) {
    console.error('[EXPORT CSV EXCEPTION]:', error);
    return sendResponse(res, 500, false, 'Server Exception executing CSV data dump');
  }
});

// ------------------------------------------------------------------------------
// END OF CHUNK 4/5
// ==============================================================================
// ==============================================================================
// FILE: app.js
// CHUNK: 5 / 5 (Error Handling, 404 Route Catcher, Graceful Shutdown & Server Initialization)
// ==============================================================================

// ------------------------------------------------------------------------------
// 11. UNHANDLED ROUTE CATCHER (404 HANDLER)
// ------------------------------------------------------------------------------

/**
 * Catch-all middleware for non-existent API endpoints and web routes
 */
app.use((req, res, next) => {
  const notFoundError = new Error(`Resource not found - ${req.originalUrl}`);
  res.status(404);
  
  if (req.accepts('json') || req.path.startsWith('/api/')) {
    return sendResponse(res, 404, false, `Endpoint Route ${req.originalUrl} does not exist on this server`);
  }

  return res.type('txt').send(`404 Not Found: The requested resource '${req.originalUrl}' could not be located.`);
});

// ------------------------------------------------------------------------------
// 12. GLOBAL ERROR HANDLING MIDDLEWARE
// ------------------------------------------------------------------------------

/**
 * Global application error interceptor middleware
 */
app.use((err, req, res, next) => {
  const statusCode = res.statusCode !== 200 ? res.statusCode : 500;
  const isProduction = process.env.NODE_ENV === 'production';

  console.error('======================================================================');
  console.error(`[GLOBAL ERROR INTERCEPTOR] Timestamp: ${new Date().toISOString()}`);
  console.error(`[REQUEST]: ${req.method} ${req.originalUrl} | IP: ${req.ip}`);
  console.error(`[MESSAGE]: ${err.message}`);
  if (!isProduction) {
    console.error(`[STACK TRACE]:\n${err.stack}`);
  }
  console.error('======================================================================');

  // Handle specific Syntax Errors (e.g. malformed JSON payloads)
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return sendResponse(res, 400, false, 'Invalid JSON payload structure provided in request body');
  }

  // Handle Multer upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return sendResponse(res, 400, false, 'Payload Error: Uploaded file exceeds allowed size limits');
  }

  const responsePayload = {
    error_type: err.name || 'InternalServerError',
    ...(isProduction ? {} : { stack: err.stack })
  };

  return sendResponse(
    res,
    statusCode,
    false,
    err.message || 'An unexpected internal server error occurred',
    responsePayload
  );
});

// ------------------------------------------------------------------------------
// 13. SERVER LISTENERS & GRACEFUL SHUTDOWN LOGIC
// ------------------------------------------------------------------------------

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

/**
 * Initialize HTTP Server Instance
 */
const server = app.listen(PORT, HOST, () => {
  console.log('----------------------------------------------------------------------');
  console.log(`🚀 [SERVER ONLINE] ${process.env.APP_NAME || 'Node.js Express Engine'}`);
  console.log(`🌐 Network URL: http://${HOST}:${PORT}`);
  console.log(`⚙️  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📅 Timestamp:   ${new Date().toISOString()}`);
  console.log('----------------------------------------------------------------------');
});

/**
 * Handle Unhandled Promise Rejections
 */
process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 [CRITICAL] Unhandled Promise Rejection detected:');
  console.error('Reason:', reason);
  // Log event without killing server instantly in production
});

/**
 * Handle Uncaught Exceptions
 */
process.on('uncaughtException', (error) => {
  console.error('💥 [CRITICAL] Uncaught Exception thrown:');
  console.error(error);
  
  // Perform graceful exit on critical exception
  gracefulShutdown('UNCAUGHT_EXCEPTION', 1);
});

/**
 * Perform Graceful Shutdown
 * @param {string} signal - Trigger signal identifier
 * @param {number} code - Exit code
 */
function gracefulShutdown(signal, code = 0) {
  console.log(`\n⚠️  [SHUTDOWN] Received signal: ${signal}. Closing HTTP connections...`);

  server.close(() => {
    console.log('✅ [SHUTDOWN] HTTP server closed cleanly. Database connections terminated.');
    process.exit(code);
  });

  // Force close after 10 seconds timeout
  setTimeout(() => {
    console.error('❌ [SHUTDOWN] Forcing server termination (Timeout reached)');
    process.exit(1);
  }, 10000);
}

// Process Signals Interceptors
process.on('SIGTERM', () => gracefulShutdown('SIGTERM', 0));
process.on('SIGINT', () => gracefulShutdown('SIGINT', 0));

// Export app instance for integration tests
module.exports = app;

// ==============================================================================
// END OF CHUNK 5/5 (COMPLETE FILE FINISHED)
// ==============================================================================
