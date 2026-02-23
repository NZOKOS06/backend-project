const pool = require('../config/database');
const bcrypt = require('bcryptjs');

async function createAdmin() {
  try {
    const adminEmail = 'admin@pharmastock.com';
    const adminPassword = 'admin123';
    const adminName = 'Administrateur';

    // Check if admin already exists
    const existingAdmin = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [adminEmail]
    );

    if (existingAdmin.rows.length > 0) {
      console.log('Admin user already exists. Updating password...');
      
      // Update existing admin password and ensure role is admin
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      await pool.query(
        'UPDATE users SET password = $1, role = $2 WHERE email = $3',
        [hashedPassword, 'admin', adminEmail]
      );
      console.log('✅ Admin user updated successfully!');
    } else {
      // Create new admin user
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      
      // First, we need to check if the role 'admin' is allowed
      // The current schema only allows 'pharmacist' or 'customer'
      // We need to alter the table to add 'admin' role
      
      try {
        await pool.query(`
          ALTER TABLE users DROP CONSTRAINT users_role_check;
        `);
      } catch (e) {
        // Constraint might not exist or already dropped
      }
      
      await pool.query(`
        ALTER TABLE users ADD CONSTRAINT users_role_check 
        CHECK (role IN ('pharmacist', 'customer', 'admin'))
      `);
      
      await pool.query(`
        INSERT INTO users (email, password, role, name)
        VALUES ($1, $2, 'admin', $3)
      `, [adminEmail, hashedPassword, adminName]);
      
      console.log('✅ Admin user created successfully!');
    }

    console.log('\n📧 Admin Login Credentials:');
    console.log(`   Email: ${adminEmail}`);
    console.log(`   Password: ${adminPassword}`);
    console.log('\n🔗 Visit the login page and use these credentials to access the admin dashboard.');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin:', error);
    process.exit(1);
  }
}

createAdmin();
