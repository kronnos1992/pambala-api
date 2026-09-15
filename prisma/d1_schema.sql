CREATE TABLE "Category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "icon" TEXT,
    "image" TEXT,
    "parentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "price" REAL NOT NULL,
    "comparePrice" REAL,
    "images" TEXT NOT NULL DEFAULT '[]',
    "condition" TEXT NOT NULL DEFAULT 'NEW',
    "stock" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "views" INTEGER NOT NULL DEFAULT 0,
    "storeId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Cart" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Cart_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "CartItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cartId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "CartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CartItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "total" REAL NOT NULL,
    "shippingFee" REAL NOT NULL DEFAULT 0,
    "paymentMethod" TEXT NOT NULL,
    "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "paymentRef" TEXT,
    "shippingName" TEXT NOT NULL,
    "shippingPhone" TEXT NOT NULL,
    "shippingAddress" TEXT NOT NULL,
    "shippingProvince" TEXT NOT NULL,
    "shippingDistrict" TEXT,
    "notes" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL, "paymentDetails" TEXT, "receiptImage" TEXT, "paymentHistory" TEXT, "validationResult" TEXT, "validationStatus" TEXT, "paymentCode" TEXT, receiptAttempts INTEGER NOT NULL DEFAULT 0, transactionFingerprint TEXT, "carrierName" TEXT, "deliveredAt" DATETIME, "estimatedDelivery" TEXT, "receivedAt" DATETIME, "shippedAt" DATETIME, "trackingCode" TEXT,
    CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" REAL NOT NULL,
    "storeId" TEXT NOT NULL,
    CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Review" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "userId" TEXT NOT NULL,
    "storeId" TEXT,
    "productId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Review_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Review_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "Address" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "district" TEXT,
    "address" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Address_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "balance" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "walletId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

CREATE INDEX "Product_storeId_idx" ON "Product"("storeId");

CREATE UNIQUE INDEX "Cart_userId_key" ON "Cart"("userId");

CREATE UNIQUE INDEX "CartItem_cartId_productId_key" ON "CartItem"("cartId", "productId");

CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

CREATE INDEX "Order_userId_idx" ON "Order"("userId");

CREATE UNIQUE INDEX "Review_userId_productId_key" ON "Review"("userId", "productId");

CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");

CREATE TABLE "Store" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "logo" TEXT,
    "banner" TEXT,
    "phone" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "rating" REAL NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "userId" TEXT NOT NULL,
    "province" TEXT,
    "district" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    "paymentMethods" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Store_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Store_slug_key" ON "Store"("slug");

CREATE UNIQUE INDEX "Store_userId_key" ON "Store"("userId");

CREATE UNIQUE INDEX "Review_userId_storeId_key" ON "Review"("userId", "storeId");

CREATE TABLE "StoreTranslation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "province" TEXT,
    "district" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StoreTranslation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CategoryTranslation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "categoryId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CategoryTranslation_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ProductTranslation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductTranslation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "StoreTranslation_storeId_locale_key" ON "StoreTranslation"("storeId", "locale");

CREATE UNIQUE INDEX "CategoryTranslation_categoryId_locale_key" ON "CategoryTranslation"("categoryId", "locale");

CREATE UNIQUE INDEX "ProductTranslation_productId_locale_key" ON "ProductTranslation"("productId", "locale");

CREATE TABLE "ReceiptQueue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lastError" TEXT,
    "result" TEXT,
    "enqueuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReceiptQueue_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ReceiptQueue_orderId_key" ON "ReceiptQueue"("orderId");

CREATE INDEX "ReceiptQueue_status_idx" ON "ReceiptQueue"("status");

CREATE TABLE "Role" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "Responsibility" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "RoleResponsibility" (
    "roleId" TEXT NOT NULL,
    "responsibilityId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("roleId", "responsibilityId"),
    CONSTRAINT "RoleResponsibility_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RoleResponsibility_responsibilityId_fkey" FOREIGN KEY ("responsibilityId") REFERENCES "Responsibility" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("userId", "roleId"),
    CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar" TEXT,
    "googleId" TEXT,
    "facebookId" TEXT,
    "linkedinId" TEXT,
    "aiValidationConsent" BOOLEAN NOT NULL DEFAULT false,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "role" TEXT NOT NULL DEFAULT 'CLIENT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

CREATE UNIQUE INDEX "User_facebookId_key" ON "User"("facebookId");

CREATE UNIQUE INDEX "User_linkedinId_key" ON "User"("linkedinId");

CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");

CREATE UNIQUE INDEX "Responsibility_key_key" ON "Responsibility"("key");

CREATE TABLE "StoreCategory" (
    "storeId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("storeId", "categoryId"),
    CONSTRAINT "StoreCategory_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StoreCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "StoreCategory_categoryId_idx" ON "StoreCategory"("categoryId");

CREATE INDEX "Order_transactionFingerprint_idx" ON "Order"("transactionFingerprint");

CREATE TABLE "OrderDispute" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "reason" TEXT NOT NULL DEFAULT 'PAYMENT_ISSUE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrderDispute_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "OrderDisputeMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "disputeId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderRole" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "attachment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderDisputeMessage_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "OrderDispute" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderDisputeMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "OrderDispute_orderId_key" ON "OrderDispute"("orderId");

CREATE INDEX "OrderDisputeMessage_disputeId_idx" ON "OrderDisputeMessage"("disputeId");

CREATE TABLE "OrderDisputeRead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "disputeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderDisputeRead_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "OrderDispute" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderDisputeRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "OrderDisputeRead_disputeId_userId_key" ON "OrderDisputeRead"("disputeId", "userId");

CREATE TABLE "OrderEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "from" TEXT,
    "to" TEXT,
    "note" TEXT,
    "actorRole" TEXT,
    "actorUserId" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "OrderEvent_orderId_createdAt_idx" ON "OrderEvent"("orderId", "createdAt");

CREATE TABLE "InvoiceCommunicationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL,
    "requestPayload" TEXT,
    "responsePayload" TEXT,
    "httpStatus" INTEGER,
    "error" TEXT,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextRetryAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvoiceCommunicationLog_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "InvoiceCommunicationLog_invoiceId_idx" ON "InvoiceCommunicationLog"("invoiceId");

CREATE INDEX "InvoiceCommunicationLog_status_idx" ON "InvoiceCommunicationLog"("status");

CREATE TABLE "FiscalSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'global',
    "productId" TEXT NOT NULL DEFAULT 'Pambala',
    "productVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "softwareValidationNumber" TEXT,
    "certificationDate" DATETIME,
    "signatureVersion" INTEGER NOT NULL DEFAULT 1,
    "signatureKeyPem" TEXT,
    "schemaVersion" TEXT NOT NULL DEFAULT '2.0',
    "agtBaseUrl" TEXT,
    "agtUsername" TEXT,
    "agtPassword" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Luanda',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT,
    "seriesId" TEXT NOT NULL,
    "fiscalProfileId" TEXT,
    "documentType" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "documentNo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "issueDate" DATETIME NOT NULL,
    "systemEntryDate" DATETIME NOT NULL,
    "dueDate" DATETIME,
    "emitterSnapshot" TEXT NOT NULL,
    "customerSnapshot" TEXT NOT NULL,
    "customerTaxId" TEXT,
    "customerCountry" TEXT NOT NULL DEFAULT 'AO',
    "currency" TEXT NOT NULL DEFAULT 'AOA',
    "subtotal" INTEGER NOT NULL,
    "discountTotal" INTEGER NOT NULL DEFAULT 0,
    "taxTotal" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "taxSummary" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "qrUrl" TEXT,
    "agtStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "agtResponse" TEXT,
    "agtRequestId" TEXT,
    "agtReference" TEXT,
    "agtValidatedAt" DATETIME,
    "originalInvoiceId" TEXT,
    "issuedByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Invoice_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Invoice_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "InvoiceSeries" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Invoice_fiscalProfileId_fkey" FOREIGN KEY ("fiscalProfileId") REFERENCES "StoreFiscalProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Invoice_originalInvoiceId_fkey" FOREIGN KEY ("originalInvoiceId") REFERENCES "Invoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Invoice_issuedByUserId_fkey" FOREIGN KEY ("issuedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "Invoice_storeId_idx" ON "Invoice"("storeId");

CREATE INDEX "Invoice_orderId_idx" ON "Invoice"("orderId");

CREATE INDEX "Invoice_issueDate_idx" ON "Invoice"("issueDate");

CREATE UNIQUE INDEX "Invoice_seriesId_number_key" ON "Invoice"("seriesId", "number");

CREATE UNIQUE INDEX "Invoice_orderId_documentType_key" ON "Invoice"("orderId", "documentType");

CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "productSku" TEXT,
    "operationType" TEXT NOT NULL DEFAULT 'TB',
    "quantity" INTEGER NOT NULL,
    "unitOfMeasure" TEXT NOT NULL DEFAULT 'UN',
    "unitPrice" INTEGER NOT NULL,
    "unitPriceBase" INTEGER NOT NULL,
    "discountAmount" INTEGER NOT NULL DEFAULT 0,
    "settlementAmount" INTEGER NOT NULL DEFAULT 0,
    "taxRate" INTEGER NOT NULL,
    "taxCode" TEXT,
    "taxAmount" INTEGER NOT NULL DEFAULT 0,
    "taxExemptionCode" TEXT,
    "lineSubtotal" INTEGER NOT NULL DEFAULT 0,
    "lineTotal" INTEGER NOT NULL DEFAULT 0,
    "reasonExempt" TEXT,
    "originalLineId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InvoiceLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InvoiceLine_originalLineId_fkey" FOREIGN KEY ("originalLineId") REFERENCES "InvoiceLine" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

CREATE TABLE "InvoiceSeries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "agtSeriesCode" TEXT,
    "establishmentNumber" TEXT NOT NULL DEFAULT 'SEDE',
    "year" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "lastNumberUsed" INTEGER,
    "authorizedQuantity" INTEGER,
    "firstDocumentNo" TEXT,
    "lastDocumentNo" TEXT,
    "validFrom" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InvoiceSeries_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "InvoiceSeries_storeId_idx" ON "InvoiceSeries"("storeId");

CREATE UNIQUE INDEX "InvoiceSeries_storeId_documentType_agtSeriesCode_year_key" ON "InvoiceSeries"("storeId", "documentType", "agtSeriesCode", "year");

CREATE TABLE "StoreFiscalProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "nif" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "district" TEXT,
    "industryCode" TEXT,
    "vatRegime" TEXT NOT NULL DEFAULT 'GERAL',
    "vatExemptionCode" TEXT,
    "establishmentNumber" TEXT NOT NULL DEFAULT 'SEDE',
    "establishmentRegistered" BOOLEAN NOT NULL DEFAULT false,
    "signatureKeyPem" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StoreFiscalProfile_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "StoreFiscalProfile_storeId_key" ON "StoreFiscalProfile"("storeId");