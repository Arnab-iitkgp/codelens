import prisma from "../lib/db";

async function main() {
  try {
    const count = await prisma.demoReview.count();
    console.log("DemoReview count:", count);
    
    // Test creating a mock entry
    const mock = await prisma.demoReview.create({
        data: {
          code: "test",
          ipAddress: "test-ip",
          status: "pending",
          currentStep: "test-step",
        },
      });
    console.log("Mock created:", mock.id);
    
    // Cleanup
    await prisma.demoReview.delete({ where: { id: mock.id } });
    console.log("Mock deleted.");
    
  } catch (e) {
    console.error("Prisma test failed:", e);
  }
}

main();
