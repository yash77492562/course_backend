#!/bin/bash

# Load environment variables
export $(cat .env | grep -v '^#' | xargs)

# Start all services using concurrently
npm run start:all
