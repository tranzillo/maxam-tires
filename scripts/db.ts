import mysql from 'mysql2/promise';

export async function getConnection() {
  return mysql.createConnection({
    host: '127.0.0.1',
    port: 10023,
    user: 'root',
    password: 'root',
    database: 'local',
  });
}
