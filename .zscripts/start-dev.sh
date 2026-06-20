#!/bin/bash
# Detached launcher for the Next.js dev server.
# Double-forks so the server survives the parent shell exiting.
cd /home/z/my-project

# Kill any existing dev server
pkill -f "next dev" 2>/dev/null
sleep 1

# Truncate log
: > dev.log

# Launch fully detached in a new session
setsid bash -c './node_modules/.bin/next dev -p 3000 >> dev.log 2>&1' < /dev/null > /dev/null 2>&1 &

# Detach from our shell
disown 2>/dev/null

echo "Dev server launched (PID family detached)."
exit 0
