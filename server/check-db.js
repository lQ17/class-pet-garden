import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const dbPath = join(__dirname, 'pet-garden.db')

const db = new Database(dbPath)

console.log('--- 查询用户 ---');
console.log(db.prepare('SELECT * FROM users').all());

console.log('\n--- 查询商品 ---');
console.log(db.prepare('SELECT * FROM products').all());

console.log('\n--- 查询学生 ---');
console.log(db.prepare('SELECT id, name, total_points, usable_points FROM students').all());

console.log('\n--- 查询兑换记录 ---');
console.log(db.prepare('SELECT * FROM redemption_records').all());
