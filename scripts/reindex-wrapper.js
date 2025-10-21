#!/usr/bin/env node

// Load .env.local first
require('dotenv').config({ path: '.env.local' })

// Now run the reindex script
require('./force-reindex-simple.js')
