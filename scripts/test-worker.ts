import { videoWorker } from '../src/queues/workers/video.worker';

console.log('🧪 Testing video worker...');
console.log('Worker instance:', videoWorker);
console.log('Worker name:', videoWorker.name);
console.log('Worker is running:', videoWorker.isRunning());
console.log('Worker is paused:', videoWorker.isPaused());

// Keep process alive
setInterval(() => {
  console.log('⏰ Worker still alive...');
}, 5000);
