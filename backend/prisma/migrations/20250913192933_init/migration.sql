-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "shopifyId" BIGINT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "shopifyId" BIGINT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "shopifyId" BIGINT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerShopifyId" BIGINT,
    "totalPrice" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_shopDomain_key" ON "Tenant"("shopDomain");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_tenantId_shopifyId_key" ON "Customer"("tenantId", "shopifyId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_tenantId_shopifyId_key" ON "Product"("tenantId", "shopifyId");

-- CreateIndex
CREATE INDEX "Order_tenantId_createdAt_idx" ON "Order"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_tenantId_customerShopifyId_idx" ON "Order"("tenantId", "customerShopifyId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_tenantId_shopifyId_key" ON "Order"("tenantId", "shopifyId");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_tenantId_customerShopifyId_fkey" FOREIGN KEY ("tenantId", "customerShopifyId") REFERENCES "Customer"("tenantId", "shopifyId") ON DELETE RESTRICT ON UPDATE CASCADE;
