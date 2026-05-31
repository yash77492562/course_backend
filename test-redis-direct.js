// Direct Redis test - bypassing NestJS
const Redis = require('ioredis');

console.log('🧪 Testing Redis connection directly...\n');

const client = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  lazyConnect: true,
});

client.on('error', (err) => {
  console.error('❌ Redis error:', err.message);
});

client.on('connect', () => {
  console.log('✅ Connected to Redis');
});

client.on('ready', () => {
  console.log('✅ Redis is ready\n');
});

async function test() {
  try {
    console.log('Step 1: Connecting to Redis...');
    await client.connect();
    console.log('✅ Connection successful\n');

    console.log('Step 2: Setting a test key...');
    await client.set('test:direct', 'Hello from direct test', 'EX', 60);
    console.log('✅ Key set successfully\n');

    console.log('Step 3: Getting the test key...');
    const value = await client.get('test:direct');
    console.log(`✅ Retrieved value: "${value}"\n`);

    console.log('Step 4: Checking if key exists...');
    const exists = await client.exists('test:direct');
    console.log(`✅ Key exists: ${exists === 1}\n`);

    console.log('Step 5: Getting TTL...');
    const ttl = await client.ttl('test:direct');
    console.log(`✅ TTL: ${ttl} seconds\n`);

    console.log('Step 6: Listing all keys...');
    const keys = await client.keys('*');
    console.log(`✅ Total keys in Redis: ${keys.length}`);
    console.log('Keys:', keys.slice(0, 10), keys.length > 10 ? '...' : '');
    console.log('');

    console.log('Step 7: Cleaning up...');
    await client.del('test:direct');
    console.log('✅ Test key deleted\n');

    console.log('========================================');
    console.log('✅ ALL TESTS PASSED');
    console.log('========================================');
    console.log('Redis is working correctly!');
    console.log('The issue must be in the NestJS RedisService.');
    
    await client.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ TEST FAILED');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

test();
