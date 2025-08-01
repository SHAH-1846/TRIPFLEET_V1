const mongoose = require('mongoose');
const dotenv = require('dotenv');
const GoodsAccepted = require('../models/goods_accepted');

dotenv.config();
const MONGO_URI = process.env.MONGODB_URI;

const goodsAccepted = [
  {
    _id: '684aa71cb88048daeaebff90',
    name: 'Electronics',
    description: 'Electronic devices and components',
    status: 'active',
  },
  {
    _id: '684aa728b88048daeaebff91',
    name: 'Furniture',
    description: 'Furniture and home decor items',
    status: 'active',
  },
  {
    _id: '684aa733b88048daeaebff92',
    name: 'Textiles',
    description: 'Fabric, clothing, and textile products',
    status: 'active',
  },
  {
    _id: '684aa733b88048daeaebff93',
    name: 'Food',
    description: 'Food products and consumables',
    status: 'active',
  },
  {
    _id: '684aa733b88048daeaebff94',
    name: 'Machinery',
    description: 'Industrial machinery and equipment',
    status: 'active',
  },
  {
    _id: '684aa733b88048daeaebff95',
    name: 'Construction Material',
    description: 'Building materials and construction supplies',
    status: 'active',
  },
];

async function connectDB() {
  await mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
}

async function up() {
  try {
    await connectDB();
    await GoodsAccepted.insertMany(goodsAccepted);
    console.log('✅ Goods accepted seeded successfully.');
  } catch (error) {
    console.error('❌ Error seeding goods accepted:', error);
  } finally {
    mongoose.connection.close();
  }
}

async function down() {
  try {
    await connectDB();
    const names = goodsAccepted.map((type) => type.name);
    await GoodsAccepted.deleteMany({ name: { $in: names } });
    console.log('✅ Goods accepted rollback successful.');
  } catch (error) {
    console.error('❌ Error rolling back goods accepted:', error);
  } finally {
    mongoose.connection.close();
  }
}

// CLI entry
const action = process.argv[2];

if (action === 'up') up();
else if (action === 'down') down();
else {
  console.log('❗ Please specify "up" or "down" as an argument.');
  process.exit(1);
} 