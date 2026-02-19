@echo off
echo ============================================
echo  ONECHAIN RACING - SQLite Setup
echo ============================================
echo.

echo Step 1: Generate Prisma Client...
call npx prisma generate
if errorlevel 1 goto error
echo.

echo Step 2: Create SQLite Database and Run Migrations...
call npx prisma migrate dev --name init_sqlite
if errorlevel 1 goto error
echo.

echo Step 3: Seed Database with Test Data...
call npx prisma db seed
if errorlevel 1 goto error
echo.

echo ============================================
echo  SUCCESS! SQLite Database Ready
echo ============================================
echo.
echo Database file: E:\MiniLabs\backend\dev.db
echo.
echo Next steps:
echo 1. Generate JWT tokens: node generate-test-tokens.js
echo 2. Start backend: npm run dev
echo 3. Open frontend and start testing!
echo.
pause
goto end

:error
echo.
echo ============================================
echo  ERROR! Setup failed
echo ============================================
echo.
echo Please check the error message above
pause

:end
