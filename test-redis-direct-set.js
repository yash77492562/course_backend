const Redis = require('ioredis');

console.log('🧪 Testing Direct Redis SET Operation');
console.log('=====================================\n');

async function testRedis() {
  console.log('1️⃣ Creating Redis client...');
  const client = new Redis({
    host: 'localhost',
    port: 6379,
    lazyConnect: false,
  });

  client.on('connect', () => {
    console.log('✅ Connected to Redis');
  });

  client.on('ready', () => {
    console.log('✅ Redis is ready');
  });

  client.on('error', (err) => {
    console.error('❌ Redis error:', err.message);
  });

  try {
    // Wait for connection
    await new Promise((resolve, reject) => {
      client.once('ready', resolve);
      client.once('error', reject);
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });

    console.log('\n2️⃣ Testing PING...');
    const pong = await client.ping();
    console.log(`✅ PING response: ${pong}`);

    console.log('\n3️⃣ Setting test key...');
    const testData = { message: 'Hello from direct test', timestamp: Date.now() };
    const serialized = JSON.stringify(testData);
    console.log(`📦 Data to store: ${serialized}`);
    
    await client.setex('test:direct:key', 300, serialized);
    console.log('✅ SET operation completed');

    console.log('\n4️⃣ Verifying key exists...');
    const exists = await client.exists('test:direct:key');
    console.log(`✅ Key exists: ${exists === 1}`);

    console.log('\n5️⃣ Getting value back...');
    const value = await client.get('test:direct:key');
    console.log(`✅ Retrieved value: ${value}`);

    console.log('\n6️⃣ Checking TTL...');
    const ttl = await client.ttl('test:direct:key');
    console.log(`✅ TTL: ${ttl} seconds`);

    console.log('\n7️⃣ Testing with courses:published key...');
    const courseData = [
      { id: '1', title: 'Test Course 1' },
      { id: '2', title: 'Test Course 2' }
    ];
    const courseSerialized = JSON.stringify(courseData);
    console.log(`📦 Course data size: ${courseSerialized.length} bytes`);
    
    await client.setex('courses:published', 900, courseSerialized);
    console.log('✅ SET courses:published completed');

    console.log('\n8️⃣ Verifying courses:published exists...');
    const courseExists = await client.exists('courses:published');
    console.log(`✅ courses:published exists: ${courseExists === 1}`);

    console.log('\n9️⃣ Listing all course keys...');
    const keys = await client.keys('courses:*');
    console.log(`✅ Found ${keys.length} course keys:`);
    keys.forEach(key => console.log(`   🔑 ${key}`));

    console.log('\n✅ All tests passed! Redis is working correctly.');
    
    await client.disconnect();
    console.log('❌ Disconnected from Redis');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testRedis();
