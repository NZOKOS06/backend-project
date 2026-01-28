const pool = require('../config/database');
const bcrypt = require('bcryptjs');

async function initDatabase() {
  try {
    console.log('Initializing database...');

    // Create tables
    await pool.query(`
      DROP TABLE IF EXISTS inventory CASCADE;
      DROP TABLE IF EXISTS products CASCADE;
      DROP TABLE IF EXISTS pharmacies CASCADE;
      DROP TABLE IF EXISTS users CASCADE;

      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL CHECK (role IN ('pharmacist', 'customer')),
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE pharmacies (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        address TEXT NOT NULL,
        phone VARCHAR(50),
        pharmacist_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE inventory (
        id SERIAL PRIMARY KEY,
        pharmacy_id INTEGER REFERENCES pharmacies(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
        price DECIMAL(10,2),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(pharmacy_id, product_id)
      );

      CREATE INDEX idx_products_name ON products(name);
      CREATE INDEX idx_inventory_pharmacy ON inventory(pharmacy_id);
      CREATE INDEX idx_inventory_product ON inventory(product_id);
    `);

    console.log('Tables created successfully');

    // Insert demo data
    const hashedPassword = await bcrypt.hash('password123', 10);
    
    // Create pharmacists
    const pharmacistResult = await pool.query(`
      INSERT INTO users (email, password, role, name)
      VALUES 
        ('pharma1@example.com', $1, 'pharmacist', 'Pharmacie du Centre'),
        ('pharma2@example.com', $1, 'pharmacist', 'Pharmacie de la Gare'),
        ('pharma3@example.com', $1, 'pharmacist', 'Pharmacie Saint-Martin')
      RETURNING id, email, name
    `, [hashedPassword]);

    console.log('Pharmacists created:', pharmacistResult.rows);

    // Create pharmacies
    const pharmacyResult = await pool.query(`
      INSERT INTO pharmacies (name, address, phone, pharmacist_id)
      VALUES 
        ('Pharmacie du Centre', '15 Rue de la République, 75001 Paris', '01 23 45 67 89', $1),
        ('Pharmacie de la Gare', '8 Avenue de la Gare, 75010 Paris', '01 98 76 54 32', $2),
        ('Pharmacie Saint-Martin', '42 Boulevard Saint-Martin, 75003 Paris', '01 45 67 89 01', $3)
      RETURNING id, name
    `, [pharmacistResult.rows[0].id, pharmacistResult.rows[1].id, pharmacistResult.rows[2].id]);

    console.log('Pharmacies created:', pharmacyResult.rows);

    // Create products
    const productResult = await pool.query(`
      INSERT INTO products (name, description, category)
      VALUES 
        ('Doliprane 500mg', 'Paracétamol 500mg - 16 comprimés', 'Douleur et fièvre'),
        ('Doliprane 1000mg', 'Paracétamol 1000mg - 8 comprimés', 'Douleur et fièvre'),
        ('Advil 200mg', 'Ibuprofène 200mg - 20 comprimés', 'Anti-inflammatoire'),
        ('Advil 400mg', 'Ibuprofène 400mg - 20 comprimés', 'Anti-inflammatoire'),
        ('Smecta', 'Diosmectite - 30 sachets', 'Digestion'),
        ('Imodium', 'Lopéramide - 12 gélules', 'Digestion'),
        ('Efferalgan', 'Paracétamol effervescent 500mg - 20 comprimés', 'Douleur et fièvre'),
        ('Spasfon', 'Phloroglucinol - 30 comprimés', 'Douleur abdominale'),
        ('Eludril', 'Chlorhexidine - 200ml', 'Hygiène bucco-dentaire'),
        ('Bepanthen', 'Dexpanthénol - 100g', 'Soins de la peau'),
        ('Cicalfate', 'Crème réparatrice - 40ml', 'Soins de la peau'),
        ('Homéoplasmine', 'Pommade - 40g', 'Soins de la peau'),
        ('Strepsils', 'Pastilles pour la gorge - 24 pastilles', 'Buccal'),
        ('Humex', 'Paracétamol + pseudoéphédrine - 16 comprimés', 'Rhume'),
        ('Actifed', 'Triprolidine + pseudoéphédrine - 15 comprimés', 'Rhume'),
        ('Magnesium B6', 'Magnésium + Vitamine B6 - 60 comprimés', 'Complément'),
        ('Vitamine C', 'Acide ascorbique 500mg - 30 comprimés', 'Complément'),
        ('Omega 3', 'Huile de poisson - 60 capsules', 'Complément'),
        ('Dafalgan', 'Paracétamol 500mg - 16 comprimés', 'Douleur et fièvre'),
        ('Nurofen', 'Ibuprofène 400mg - 12 comprimés', 'Anti-inflammatoire')
      RETURNING id, name
    `);

    console.log('Products created:', productResult.rows.length);

    // Create inventory
    await pool.query(`
      INSERT INTO inventory (pharmacy_id, product_id, quantity, price)
      VALUES 
        -- Pharmacie du Centre
        (1, 1, 150, 4.50),
        (1, 2, 80, 5.20),
        (1, 3, 100, 6.80),
        (1, 5, 60, 8.90),
        (1, 7, 45, 7.50),
        (1, 9, 30, 9.90),
        (1, 11, 25, 12.50),
        (1, 13, 70, 6.40),
        (1, 15, 40, 8.70),
        (1, 17, 55, 7.20),
        (1, 19, 90, 4.80),
        -- Pharmacie de la Gare
        (2, 1, 200, 4.30),
        (2, 2, 120, 5.00),
        (2, 4, 85, 7.50),
        (2, 6, 50, 9.20),
        (2, 8, 35, 8.80),
        (2, 10, 40, 11.90),
        (2, 12, 60, 6.50),
        (2, 14, 80, 7.80),
        (2, 16, 45, 12.00),
        (2, 18, 30, 15.50),
        (2, 20, 100, 6.20),
        -- Pharmacie Saint-Martin
        (3, 2, 60, 5.50),
        (3, 3, 90, 6.50),
        (3, 5, 75, 8.50),
        (3, 7, 55, 7.80),
        (3, 9, 40, 9.50),
        (3, 11, 35, 12.80),
        (3, 13, 85, 6.20),
        (3, 15, 50, 8.50),
        (3, 17, 65, 7.00),
        (3, 19, 110, 4.60),
        (3, 1, 180, 4.40)
    `);

    console.log('Inventory created successfully');

    console.log('\n✅ Database initialized successfully!');
    console.log('\nDemo accounts:');
    console.log('  Pharmacist 1: pharma1@example.com / password123');
    console.log('  Pharmacist 2: pharma2@example.com / password123');
    console.log('  Pharmacist 3: pharma3@example.com / password123');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error initializing database:', error);
    process.exit(1);
  }
}

initDatabase();
