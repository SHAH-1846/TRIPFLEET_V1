/**
 * Migration: Add unique constraint to whatsappNumber field
 * This migration ensures that WhatsApp numbers are unique across all users
 */

const mongoose = require('mongoose');
const users = require('../models/users');

const migrationName = 'whatsapp_number_unique_migration';

async function up() {
  try {
    console.log('Starting whatsapp_number_unique_migration...');

    // Check if migration has already been run
    const migrationCollection = mongoose.connection.db.collection('migrations');
    const existingMigration = await migrationCollection.findOne({ name: migrationName });
    
    if (existingMigration) {
      console.log('Migration already completed, skipping...');
      return;
    }

    // Find duplicate WhatsApp numbers
    const duplicates = await users.aggregate([
      {
        $group: {
          _id: '$whatsappNumber',
          count: { $sum: 1 },
          userIds: { $push: '$_id' }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      }
    ]);

    if (duplicates.length > 0) {
      console.log(`Found ${duplicates.length} duplicate WhatsApp numbers:`);
      
      for (const duplicate of duplicates) {
        console.log(`WhatsApp number: ${duplicate._id}, Count: ${duplicate.count}`);
        
        // Keep the first user (oldest) and update others to have a unique number
        const [keepUser, ...updateUsers] = duplicate.userIds;
        
        for (let i = 0; i < updateUsers.length; i++) {
          const userId = updateUsers[i];
          const newWhatsAppNumber = `${duplicate._id}_duplicate_${i + 1}`;
          
          await users.findByIdAndUpdate(userId, {
            whatsappNumber: newWhatsAppNumber,
            updatedAt: new Date()
          });
          
          console.log(`Updated user ${userId} WhatsApp number to: ${newWhatsAppNumber}`);
        }
      }
    }

    // Create unique index
    await users.collection.createIndex(
      { whatsappNumber: 1 },
      { 
        unique: true,
        name: 'whatsappNumber_unique_index'
      }
    );

    console.log('Created unique index on whatsappNumber field');

    // Record migration as completed
    await migrationCollection.insertOne({
      name: migrationName,
      completedAt: new Date(),
      description: 'Added unique constraint to whatsappNumber field'
    });

    console.log('whatsapp_number_unique_migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

async function down() {
  try {
    console.log('Rolling back whatsapp_number_unique_migration...');

    // Drop the unique index
    await users.collection.dropIndex('whatsappNumber_unique_index');
    console.log('Dropped unique index on whatsappNumber field');

    // Remove migration record
    const migrationCollection = mongoose.connection.db.collection('migrations');
    await migrationCollection.deleteOne({ name: migrationName });

    console.log('whatsapp_number_unique_migration rolled back successfully');
  } catch (error) {
    console.error('Rollback failed:', error);
    throw error;
  }
}

module.exports = { up, down }; 