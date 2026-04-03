import Database from 'better-sqlite3'
const db = new Database('./server/pet-garden.db', { verbose: console.log })

console.log('--- 查询用户 ---');
console.log(db.prepare('SELECT * FROM users').all());

console.log('\n--- 查询商品 ---');
console.log(db.prepare('SELECT * FROM products').all());

console.log('\n--- 查询学生 ---');
console.log(db.prepare('SELECT id, name, total_points, usable_points FROM students').all());
