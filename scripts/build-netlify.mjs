import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const distDir = path.join(root, 'dist');

const rootFiles = [
  'about.html',
  'checkout.html',
  'contact.html',
  'donate.html',
  'favicon.ico',
  'gallery.html',
  'gallery_contact_sheet.html',
  'impact.html',
  'index.html',
  'payment-cancelled.html',
  'payment-success.html',
  'shop.html',
  'work.html',
];

const rootDirs = [
  'assets',
  'data',
];

async function removeDir(target) {
  await fs.rm(target, { recursive: true, force: true });
}

async function ensureDir(target) {
  await fs.mkdir(target, { recursive: true });
}

async function copyFileRelative(relativePath) {
  const source = path.join(root, relativePath);
  const destination = path.join(distDir, relativePath);
  await ensureDir(path.dirname(destination));
  await fs.copyFile(source, destination);
}

async function copyDirRecursive(sourceDir, destinationDir) {
  await ensureDir(destinationDir);
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const source = path.join(sourceDir, entry.name);
    const destination = path.join(destinationDir, entry.name);

    if (entry.isDirectory()) {
      await copyDirRecursive(source, destination);
    } else if (entry.isFile()) {
      await ensureDir(path.dirname(destination));
      await fs.copyFile(source, destination);
    }
  }
}

async function build() {
  await removeDir(distDir);
  await ensureDir(distDir);

  for (const relativePath of rootFiles) {
    await copyFileRelative(relativePath);
  }

  for (const dirName of rootDirs) {
    await copyDirRecursive(path.join(root, dirName), path.join(distDir, dirName));
  }
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
