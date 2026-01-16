// server/routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../prismaClient');
const { sendPasswordResetEmail } = require('../services/emailService');

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  console.log(`🔐 Login attempt for email: ${email}`);
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const employee = await prisma.employees.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' }
      },
      include: {
        role: true
      }
    });

    if (!employee) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!employee.active_flag) {
      return res.status(403).json({ error: 'This employee account has been deactivated' });
    }

    // Use bcrypt to compare password with hashed password
    const isPasswordValid = await bcrypt.compare(password, employee.password);
    if(!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    console.log('Login successful! Returning employee data with role:', {
      id: employee.id,
      email: employee.email,
      hasRole: !!employee.role
    });

    return res.json({
      success: true,
      employee: employee,
      message: 'Login successful'
    });
  } catch (err) {
    console.error('POST /api/auth/login error', err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// POST /api/auth/reset-request
// Body: { email }
// Generates a JWT password reset token and sends email to the employee
router.post('/reset-request', async (req, res) => {
  const { email } = req.body || {};

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    // Find employee by email
    const employee = await prisma.employees.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' }
      }
    });

    // For security, always return success even if email doesn't exist
    // This prevents email enumeration attacks
    if (!employee) {
      return res.json({
        success: true,
        message: 'If an account exists with this email, a password reset link has been sent to your email address.'
      });
    }

    // Check if employee is active
    if (!employee.active_flag) {
      return res.json({
        success: true,
        message: 'If an account exists with this email, a password reset link has been sent to your email address.'
      });
    }

    // Generate JWT token with employee ID and expiration
    const jwtSecret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    const resetToken = jwt.sign(
      {
        employeeId: employee.id,
        email: employee.email,
        type: 'password-reset'
      },
      jwtSecret,
      { expiresIn: '1h' } // Token expires in 1 hour
    );

    // Send password reset email
    const emailSent = await sendPasswordResetEmail(
      employee.email,
      employee.name || employee.display_name || 'User',
      resetToken
    );

    if (!emailSent) {
      console.warn('⚠️  Email not sent, but showing success to user for security');
      // For development: log the reset link
      const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
      console.log(`🔗 Password reset link for ${employee.email}:`);
      console.log(`   ${clientUrl}/reset-password?token=${resetToken}`);
    }

    return res.json({
      success: true,
      message: 'If an account exists with this email, a password reset link has been sent to your email address.'
    });
  } catch (err) {
    console.error('POST /api/auth/reset-request error', err);
    res.status(500).json({ error: 'Server error during password reset request' });
  }
});

// POST /api/auth/reset-confirm
// Body: { token, newPassword }
// Validates the JWT reset token and updates the employee's password
router.post('/reset-confirm', async (req, res) => {
  const { token, newPassword } = req.body || {};

  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token and new password are required' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }

  try {
    // Verify and decode JWT token
    const jwtSecret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    let decoded;

    try {
      decoded = jwt.verify(token, jwtSecret);
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(400).json({ error: 'Reset link has expired. Please request a new password reset.' });
      }
      return res.status(400).json({ error: 'Invalid reset token' });
    }

    // Verify token type
    if (decoded.type !== 'password-reset') {
      return res.status(400).json({ error: 'Invalid token type' });
    }

    // Find employee
    const employee = await prisma.employees.findUnique({
      where: { id: decoded.employeeId }
    });

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Check if employee is still active
    if (!employee.active_flag) {
      return res.status(403).json({ error: 'This employee account has been deactivated' });
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update employee's password
    await prisma.employees.update({
      where: { id: employee.id },
      data: {
        password: hashedPassword,
        updated_at: new Date()
      }
    });

    console.log(`Password successfully reset for employee: ${employee.email}`);

    return res.json({
      success: true,
      message: 'Password has been successfully reset. You can now log in with your new password.'
    });
  } catch (err) {
    console.error('POST /api/auth/reset-confirm error', err);
    res.status(500).json({ error: 'Server error during password reset confirmation' });
  }
});

// POST /api/auth/verify-session
// Body: { employeeId }
// Verifies that the session is still valid by checking if employee exists and is active
router.post('/verify-session', async (req, res) => {
  const { employeeId } = req.body || {};

  if (!employeeId) {
    return res.status(400).json({ error: 'Employee ID is required' });
  }

  try {
    const employee = await prisma.employees.findUnique({
      where: { id: employeeId },
      include: {
        role: true
      }
    });

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    if (!employee.active_flag) {
      return res.status(403).json({ error: 'This employee account has been deactivated' });
    }

    return res.json({
      success: true,
      employee: employee
    });
  } catch (err) {
    console.error('POST /api/auth/verify-session error', err);
    res.status(500).json({ error: 'Server error during session verification' });
  }
});

// POST /api/auth/change-password
// Body: { employeeId, currentPassword, newPassword }
router.post('/change-password', async (req, res) => {
  const { employeeId, currentPassword, newPassword } = req.body || {};

  if (!employeeId || !currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Employee ID, current password, and new password are required' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }

  try {
    const employee = await prisma.employees.findUnique({
      where: { id: employeeId }
    });

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    if (!employee.active_flag) {
      return res.status(403).json({ error: 'This employee account has been deactivated' });
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, employee.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await prisma.employees.update({
      where: { id: employeeId },
      data: {
        password: hashedPassword,
        updated_at: new Date()
      }
    });

    return res.json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (err) {
    console.error('POST /api/auth/change-password error', err);
    res.status(500).json({ error: 'Server error during password change' });
  }
});

module.exports = router;
