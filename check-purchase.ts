import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkPurchaseStatus() {
  try {
    console.log('🔍 Checking purchase status...\n');
    
    // Find user by email
    const user = await prisma.user.findFirst({
      where: { email: 'yashyadavpro@gmail.com' }
    });
    
    if (!user) {
      console.log('❌ User not found');
      return;
    }
    
    console.log('✅ User found:');
    console.log('  - ID:', user.id);
    console.log('  - Email:', user.email);
    console.log('  - Name:', user.firstName, user.lastName);
    
    // Check purchase history
    console.log('\n📋 Purchase History:');
    const purchaseHistory = user.purchaseHistory as any[];
    if (purchaseHistory && purchaseHistory.length > 0) {
      purchaseHistory.forEach((purchase, index) => {
        console.log(`\n  Purchase ${index + 1}:`);
        console.log('  - Course ID:', purchase.courseId);
        console.log('  - Course Name:', purchase.courseName);
        console.log('  - Amount:', purchase.amount, purchase.currency);
        console.log('  - Status:', purchase.paymentStatus);
        console.log('  - Date:', purchase.purchasedAt);
      });
    } else {
      console.log('  ❌ No purchases in history');
    }
    
    // Check enrollments
    console.log('\n📋 Course Enrollments:');
    const enrollments = await prisma.userCourseEnrollment.findMany({
      where: { userId: user.id },
      include: { course: { select: { title: true } } }
    });
    
    if (enrollments.length > 0) {
      enrollments.forEach((enrollment, index) => {
        console.log(`\n  Enrollment ${index + 1}:`);
        console.log('  - Course ID:', enrollment.courseId);
        console.log('  - Course Title:', enrollment.course.title);
        console.log('  - Status:', enrollment.status);
        console.log('  - Enrolled:', enrollment.enrolledAt);
        console.log('  - Expires:', enrollment.expiresAt);
        console.log('  - Progress:', enrollment.progress + '%');
      });
    } else {
      console.log('  ❌ No enrollments found');
    }
    
    // Check orders
    console.log('\n📋 Orders:');
    const orders = await prisma.order.findMany({
      where: { userId: user.id },
      include: { course: { select: { title: true } } }
    });
    
    if (orders.length > 0) {
      orders.forEach((order, index) => {
        console.log(`\n  Order ${index + 1}:`);
        console.log('  - Order ID:', order.id);
        console.log('  - Course ID:', order.courseId);
        console.log('  - Course Title:', order.course.title);
        console.log('  - Amount:', order.amount, order.currency);
        console.log('  - Payment Status:', order.paymentStatus);
        console.log('  - Order Status:', order.orderStatus);
        console.log('  - Created:', order.createdAt);
      });
    } else {
      console.log('  ❌ No orders found');
    }
    
    // List all courses
    console.log('\n📋 Available Courses:');
    const courses = await prisma.course.findMany({
      select: { id: true, title: true, status: true, price: true }
    });
    
    courses.forEach((course, index) => {
      console.log(`\n  Course ${index + 1}:`);
      console.log('  - ID:', course.id);
      console.log('  - Title:', course.title);
      console.log('  - Status:', course.status);
      console.log('  - Price:', course.price);
    });
    
    console.log('\n\n🔍 SUMMARY:');
    console.log('='.repeat(60));
    console.log('User ID:', user.id);
    console.log('Purchases in History:', purchaseHistory?.length || 0);
    console.log('Active Enrollments:', enrollments.length);
    console.log('Total Orders:', orders.length);
    console.log('Available Courses:', courses.length);
    console.log('='.repeat(60));
    
    // Check specific course
    const targetCourseId = '69c65b0ab8422af8511ad61d';
    console.log('\n🎯 Checking access to course:', targetCourseId);
    
    const hasEnrollment = enrollments.some(e => e.courseId === targetCourseId && e.status === 'ACTIVE');
    const hasPurchase = purchaseHistory?.some((p: any) => p.courseId === targetCourseId && p.paymentStatus === 'SUCCEEDED');
    const hasOrder = orders.some(o => o.courseId === targetCourseId && o.paymentStatus === 'SUCCEEDED');
    
    console.log('  - Has Enrollment:', hasEnrollment ? '✅ YES' : '❌ NO');
    console.log('  - Has Purchase:', hasPurchase ? '✅ YES' : '❌ NO');
    console.log('  - Has Order:', hasOrder ? '✅ YES' : '❌ NO');
    console.log('  - Should Have Access:', (hasEnrollment || hasPurchase || hasOrder) ? '✅ YES' : '❌ NO');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkPurchaseStatus();
