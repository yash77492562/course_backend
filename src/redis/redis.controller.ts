import { Controller, Get, Post, Body } from '@nestjs/common';
import { RedisService } from './redis.service';

@Controller('redis-test')
export class RedisTestController {
  constructor(private readonly redisService: RedisService) {}

  @Get('status')
  async getStatus() {
    return {
      message: 'Redis test endpoint',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('set')
  async testSet(@Body() body: { key: string; value: any; ttl?: number }) {
    console.log('\n🧪 ========== TEST SET ENDPOINT CALLED ==========');
    console.log(`📥 Request body:`, body);
    
    try {
      await this.redisService.set(body.key, body.value, body.ttl || 300);
      
      // Verify it was stored
      const retrieved = await this.redisService.get(body.key);
      
      return {
        success: true,
        message: 'Data stored in Redis',
        key: body.key,
        ttl: body.ttl || 300,
        verified: retrieved !== null,
        retrievedValue: retrieved,
      };
    } catch (error) {
      console.error('❌ Test SET failed:', error);
      return {
        success: false,
        error: error.message,
        stack: error.stack,
      };
    }
  }

  @Get('get/:key')
  async testGet(@Body() body: { key: string }) {
    console.log('\n🧪 ========== TEST GET ENDPOINT CALLED ==========');
    console.log(`📥 Key:`, body.key);
    
    try {
      const value = await this.redisService.get(body.key);
      
      return {
        success: true,
        key: body.key,
        found: value !== null,
        value,
      };
    } catch (error) {
      console.error('❌ Test GET failed:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
