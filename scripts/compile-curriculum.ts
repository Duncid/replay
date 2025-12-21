#!/usr/bin/env node
/**
 * CLI script to compile quest graph JSON into curriculum export JSON
 *
 * Usage:
 *   npx tsx scripts/compile-curriculum.ts [input-path] [output-path]
 *
 * Or add to package.json scripts and run:
 *   npm run compile-curriculum [input-path] [output-path]
 *
 * Examples:
 *   npx tsx scripts/compile-curriculum.ts quest.json
 *   npx tsx scripts/compile-curriculum.ts quest.json dist/curriculum.export.json
 *
 * Note: This script uses TypeScript path aliases (@/). Use tsx or ts-node with
 * path alias support to run it directly, or build the project first.
 */

import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";

// Import compiler - path alias @/ should be resolved by tsx/ts-node or build system
const compilerModule = await import("../src/utils/curriculumCompiler.js");
const { compileCurriculum } = compilerModule;

async function compile() {
  try {
    // Get input and output paths from command line args
    const inputPath = process.argv[2] || "quest.json";
    const outputPath = process.argv[3] || "dist/curriculum.export.json";

    // Read input file
    let questData;
    try {
      const inputFile = resolve(process.cwd(), inputPath);
      const fileContent = readFileSync(inputFile, "utf-8");
      questData = JSON.parse(fileContent);
    } catch (error) {
      console.error(`Error reading input file "${inputPath}":`);
      if (error instanceof Error) {
        console.error(error.message);
      }
      process.exit(1);
    }

    // Compile curriculum
    const result = compileCurriculum(questData);

    if (!result.success) {
      console.error("Compilation failed with the following errors:\n");
      for (const error of result.errors) {
        if (error.nodeId) {
          console.error(`  - ${error.message} (node: ${error.nodeId})`);
        } else if (error.edgeId) {
          console.error(`  - ${error.message} (edge: ${error.edgeId})`);
        } else {
          console.error(`  - ${error.message}`);
        }
      }
      process.exit(1);
    }

    if (!result.export) {
      console.error("Compilation failed: no export generated");
      process.exit(1);
    }

    // Ensure output directory exists
    const outputFile = resolve(process.cwd(), outputPath);
    const outputDir = dirname(outputFile);
    try {
      mkdirSync(outputDir, { recursive: true });
    } catch (error) {
      // Directory might already exist, that's fine
    }

    // Write output file
    try {
      writeFileSync(
        outputFile,
        JSON.stringify(result.export, null, 2),
        "utf-8"
      );
      console.log(`✓ Successfully compiled curriculum to "${outputPath}"`);
      console.log(`  - Tracks: ${result.export.tracks.length}`);
      console.log(`  - Lessons: ${result.export.lessons.length}`);
      console.log(`  - Skills: ${result.export.skills.length}`);
    } catch (error) {
      console.error(`Error writing output file "${outputPath}":`);
      if (error instanceof Error) {
        console.error(error.message);
      }
      process.exit(1);
    }
  } catch (error) {
    console.error("Unexpected error:");
    if (error instanceof Error) {
      console.error(error.message);
      if (error.stack) {
        console.error(error.stack);
      }
    }
    process.exit(1);
  }
}

compile();
