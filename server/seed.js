// server/seed.js
// Run this script to create initial admin user and roles after deployment
// Usage: node seed.js

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seeding...\n');

  try {
    // Check if admin role already exists
    let adminRole = await prisma.roles.findFirst({
      where: { name: 'admin' }
    });

    if (!adminRole) {
      console.log('Creating admin role...');
      adminRole = await prisma.roles.create({
        data: {
          name: 'admin',
          permissions: [
            'dashboard',
            'schedule',
            'info',
            'cases',
            'access',
            'delivery',
            'installation',
            'warehouse',
            'customer'
          ]
        }
      });
      console.log('✓ Admin role created');
    } else {
      console.log('✓ Admin role already exists');
    }

    // Check if admin user already exists
    const existingAdmin = await prisma.employees.findFirst({
      where: { email: 'admin@tbm.com' }
    });

    if (!existingAdmin) {
      console.log('Creating admin user...');
      const hashedPassword = await bcrypt.hash('Admin123!', 10);

      const adminUser = await prisma.employees.create({
        data: {
          email: 'admin@tbm.com',
          password: hashedPassword,
          name: 'System Administrator',
          display_name: 'Admin',
          contact_number: '+60123456789',
          role_id: adminRole.id,
          active_flag: true,
          bio: 'System Administrator Account'
        }
      });

      console.log('✓ Admin user created');
      console.log('\n=================================');
      console.log('Admin Login Credentials:');
      console.log('Email: admin@tbm.com');
      console.log('Password: Admin123!');
      console.log('=================================');
      console.log('\n⚠️  IMPORTANT: Change this password after first login!');
    } else {
      console.log('✓ Admin user already exists');
    }

    // Create other common roles
    console.log('\nCreating other roles...');

    const roles = [
      {
        name: 'delivery',
        permissions: ['dashboard', 'delivery']
      },
      {
        name: 'installer',
        permissions: ['dashboard', 'installation']
      },
      {
        name: 'warehouse',
        permissions: ['dashboard', 'warehouse']
      },
      {
        name: 'customer',
        permissions: ['customer']
      }
    ];

    for (const roleData of roles) {
      const existing = await prisma.roles.findFirst({
        where: { name: roleData.name }
      });

      if (!existing) {
        await prisma.roles.create({ data: roleData });
        console.log(`✓ ${roleData.name} role created`);
      } else {
        console.log(`✓ ${roleData.name} role already exists`);
      }
    }

    console.log('\n✅ Database seeding completed successfully!');

  } catch (error) {
    console.error('\n❌ Error seeding database:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
