#!/bin/bash

# NotesAI Backup Script
# Usage: ./create_backup.sh [description]

# Get current directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"
BACKUP_DIR="/Users/abhinabbasnyat/Files_Backup/AI/AImaker_bootcamp/zero2one/notesAIv0_backups"

# Get description from command line or use default
DESCRIPTION=${1:-"manual_backup"}

# Create timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="notesAIv0_${TIMESTAMP}_${DESCRIPTION}"

echo "🔄 Creating backup: $BACKUP_NAME"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Create local backup
echo "📁 Creating local file system backup..."
cp -r "$PROJECT_DIR" "$BACKUP_DIR/$BACKUP_NAME"

# Verify backup was created
if [ -d "$BACKUP_DIR/$BACKUP_NAME" ]; then
    echo "✅ Local backup created successfully: $BACKUP_NAME"
    echo "📍 Location: $BACKUP_DIR/$BACKUP_NAME"
else
    echo "❌ Local backup failed!"
    exit 1
fi

# Git operations
echo "🔄 Creating Git backup..."

# CRITICAL: Verify critical files are tracked before backup
echo "🔍 Verifying critical files are tracked in git..."
CRITICAL_FILES=(
  "notesai-mvp/frontend/src/app/dashboard/page.tsx"
  "notesai-mvp/frontend/src/app/page.tsx"
  "notesai-mvp/src/app.js"
  "notesai-mvp/prisma/schema.prisma"
)

BACKUP_FAILED=0
for file in "${CRITICAL_FILES[@]}"; do
  if ! git ls-files --error-unmatch "$file" &>/dev/null 2>&1; then
    echo "⚠️  WARNING: Critical file not tracked in git: $file"
    echo "   Attempting to add to git..."
    
    # Check if parent directory is submodule
    PARENT_DIR=$(dirname "$file")
    if git ls-files --stage "$PARENT_DIR" 2>/dev/null | grep -q "^160000"; then
      echo "❌ ERROR: $PARENT_DIR is a submodule! Cannot track files in submodule."
      echo "   See docslogs/GIT_SUBMODULE_ISSUE.md for fix instructions"
      BACKUP_FAILED=1
    else
      git add "$file"
      if git ls-files --error-unmatch "$file" &>/dev/null 2>&1; then
        echo "   ✅ File added to git successfully"
      else
        echo "   ❌ Failed to add file to git"
        BACKUP_FAILED=1
      fi
    fi
  else
    echo "✅ $file is tracked in git"
  fi
done

if [ $BACKUP_FAILED -eq 1 ]; then
  echo ""
  echo "❌ BACKUP FAILED: Critical files are not tracked in git!"
  echo "   Local backup created successfully: $BACKUP_NAME"
  echo "   BUT git backup is incomplete - git restore will fail for untracked files"
  echo "   See docslogs/GIT_SUBMODULE_ISSUE.md for fix instructions"
  echo ""
  echo "⚠️  Proceeding with partial backup (local only)..."
fi

# Add all changes
git add .

# Verify frontend files are staged
if git status --short | grep -q "notesai-mvp/frontend"; then
  echo "✅ Frontend files are staged for commit"
else
  echo "⚠️  WARNING: No frontend files staged for commit"
  echo "   Git restore will NOT work for frontend files"
fi

# Create commit
git commit -m "Backup: $DESCRIPTION - $(date)"

# Verify files are in commit
echo "🔍 Verifying files in commit..."
if git ls-tree -r HEAD notesai-mvp/frontend/src/app/dashboard/page.tsx &>/dev/null; then
  echo "✅ Frontend files are in git commit"
else
  echo "❌ WARNING: Frontend files NOT in git commit!"
  echo "   Git restore will fail for frontend files"
fi

# Push to GitHub with upstream tracking
echo "🚀 Pushing to GitHub..."
CURRENT_BRANCH=$(git branch --show-current)

# Push current branch (with new commits)
echo "   Pushing current branch: $CURRENT_BRANCH"
if ! git rev-parse --abbrev-ref --symbolic-full-name @{u} &>/dev/null; then
  echo "   Setting upstream tracking for branch: $CURRENT_BRANCH"
  git push --set-upstream origin "$CURRENT_BRANCH"
  CURRENT_PUSH_EXIT=$?
else
  git push origin "$CURRENT_BRANCH"
  CURRENT_PUSH_EXIT=$?
fi

# ⚠️  PROTECTION: Skip pushing staging and main branches to prevent overwriting production/staging
# These branches are protected - only push when explicitly merging via PR
echo "   🔒 PROTECTED: Skipping staging and main branches (production/staging protection)"
echo "   ℹ️  Only current branch ($CURRENT_BRANCH) will be pushed"
  STAGING_PUSH_EXIT=0
  MAIN_PUSH_EXIT=0

# Verify push succeeded
if [ $CURRENT_PUSH_EXIT -eq 0 ]; then
  # Verify local and remote commits match for current branch
  LOCAL_COMMIT=$(git rev-parse HEAD)
  REMOTE_COMMIT=$(git rev-parse "origin/$CURRENT_BRANCH" 2>/dev/null)
  
  if [ -n "$REMOTE_COMMIT" ] && [ "$LOCAL_COMMIT" = "$REMOTE_COMMIT" ]; then
    echo "✅ Git backup verified: Local and remote commits match for $CURRENT_BRANCH"
    echo "   Commit: $LOCAL_COMMIT"
  else
    echo "⚠️  WARNING: Could not verify remote push (remote commit check failed)"
    echo "   Local commit: $LOCAL_COMMIT"
    echo "   Verify manually: git log origin/$CURRENT_BRANCH"
  fi
  
  if [ $BACKUP_FAILED -eq 0 ]; then
    echo "✅ Git backup completed: Current branch pushed to GitHub"
    echo "   - Current branch ($CURRENT_BRANCH): Pushed"
    echo "   - Staging: 🔒 Protected (not pushed)"
    echo "   - Main: 🔒 Protected (not pushed)"
  else
    echo "⚠️  Git backup completed with warnings - see above"
  fi
else
  echo "❌ CRITICAL: Git push to GitHub FAILED!"
  echo "   Current branch push exit code: $CURRENT_PUSH_EXIT"
  echo "   Local backup exists: $BACKUP_NAME"
  echo "   BUT cloud backup (GitHub) failed - others cannot access this checkpoint"
  echo "   Manual push required: git push origin $CURRENT_BRANCH"
  exit 1
fi

# List all backups
echo ""
echo "📋 All available backups:"
ls -la "$BACKUP_DIR/"

echo ""
echo "🎯 Backup completed successfully!"
echo "📍 Local backup: $BACKUP_DIR/$BACKUP_NAME"
echo "🌐 Git backup: Current branch ($CURRENT_BRANCH) pushed to GitHub"
echo "🔒 Protection: Staging and main branches NOT pushed (production/staging protection)"
echo ""
echo "To restore from this backup:"
echo "  rm -rf notesAIv0"
echo "  cp -r $BACKUP_DIR/$BACKUP_NAME notesAIv0"
