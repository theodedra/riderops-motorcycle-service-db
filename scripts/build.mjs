#!/usr/bin/env node
/**
 * Modern build script for Motorcycle Service Database.
 * Replaces Grunt with native Node.js ESM.
 *
 * Usage: node scripts/build.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { glob } from 'glob';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

// Configuration
const SRC_DIR = 'src';
const DIST_DIR = 'dist';
const SCHEMA_PATH = join(SRC_DIR, 'moto-service.schema.json');
const DB_OUTPUT = join(DIST_DIR, 'motorcycle-service-intervals.json');
const INDEX_OUTPUT = join(DIST_DIR, 'motorcycle-service-index.json');

/**
 * Clean and recreate dist directory
 */
function cleanDist() {
    if (existsSync(DIST_DIR)) {
        rmSync(DIST_DIR, { recursive: true, force: true });
    }
    mkdirSync(DIST_DIR, { recursive: true });
    console.log('✓ Cleaned dist/');
}

/**
 * Load and compile JSON schema validator
 */
function createValidator() {
    const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf-8'));
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    return ajv.compile(schema);
}

/**
 * Validate a JSON object against the schema
 */
function validate(validator, data, filePath) {
    const valid = validator(data);
    if (!valid) {
        console.error(`✗ Validation failed for ${filePath}:`);
        for (const err of validator.errors) {
            console.error(`  - ${err.instancePath || '/'}: ${err.message}`);
        }
        process.exit(1);
    }
}

/**
 * Main build process
 */
async function build() {
    console.log('\n🏍️  Building Motorcycle Service Database...\n');

    // Step 1: Clean
    cleanDist();

    // Step 2: Create validator
    const validator = createValidator();
    console.log('✓ Schema loaded');

    // Step 3: Find all source JSON files (excluding schema)
    const sourceFiles = await glob(`${SRC_DIR}/**/*.json`, {
        ignore: [`${SRC_DIR}/**/*.schema.json`],
    });

    if (sourceFiles.length === 0) {
        console.error('✗ No source JSON files found!');
        process.exit(1);
    }

    console.log(`✓ Found ${sourceFiles.length} source files`);

    // Step 4: Process each file
    const names = new Set();
    const index = {};
    const allMotorcycles = [];

    for (const srcPath of sourceFiles) {
        const data = JSON.parse(readFileSync(srcPath, 'utf-8'));

        // Validate against schema
        validate(validator, data, srcPath);

        // Check for duplicate names
        const name = data.motorcycles[0].name;
        if (names.has(name)) {
            console.error(`✗ Duplicate motorcycle name: "${name}" in ${srcPath}`);
            process.exit(1);
        }
        names.add(name);

        // Add to merged database
        allMotorcycles.push(...data.motorcycles);

        // Build index entry
        const location = relative(SRC_DIR, srcPath);
        index[name] = {
            description: data.motorcycles[0].description,
            location,
        };

        // Copy to dist
        const destPath = join(DIST_DIR, location);
        mkdirSync(dirname(destPath), { recursive: true });
        cpSync(srcPath, destPath);
    }

    console.log('✓ All files validated');

    // Step 5: Write merged database
    const jsonDb = { motorcycles: allMotorcycles };
    validate(validator, jsonDb, DB_OUTPUT);
    writeFileSync(DB_OUTPUT, JSON.stringify(jsonDb, null, 3));
    console.log(`✓ Created ${DB_OUTPUT}`);

    // Step 6: Write index
    writeFileSync(INDEX_OUTPUT, JSON.stringify(index, null, 3));
    console.log(`✓ Created ${INDEX_OUTPUT}`);

    console.log(`\n✅ Build complete! ${sourceFiles.length} motorcycles processed.\n`);
}

build().catch((err) => {
    console.error('Build failed:', err);
    process.exit(1);
});
