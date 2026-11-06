import { test, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { openDatabase, migrate, type Database } from "../server/database";
import { grantRuntimeRole } from "../server/bootstrap";
import { randomUUID } from "node:crypto";

test("production pg driver runs migrations and bound queries over the PostgreSQL wire protocol", async () => {
  const embedded = await PGlite.create(),
    socket = new PGLiteSocketServer({
      db: embedded,
      host: "127.0.0.1",
      port: 0,
      maxConnections: 8,
    });
  let db: Database | undefined;
  try {
    await socket.start();
    db = await openDatabase({
      url: `postgresql://postgres@${socket.getServerConn()}/postgres?sslmode=disable`,
    });
    await migrate(db);
    const id = randomUUID(),
      text = "untrusted'); DROP TABLE flux_users; --";
    await db.query(
      "INSERT INTO flux_users(id,email,password_hash,created_at) VALUES($1,$2,$3,$4)",
      [id, "wire@flux.test", text, new Date().toISOString()],
    );
    const [row] = await db.query(
      "SELECT id,password_hash FROM flux_users WHERE email=$1",
      ["wire@flux.test"],
    );
    expect(row.id).toBe(id);
    expect(row.password_hash).toBe(text);
    await expect(
      db.query("SELECT * FROM flux_users WHERE email=$1", [
        "wire@flux.test' OR 1=1--",
      ]),
    ).resolves.toEqual([]);
    const [schema] = await db.query("SELECT version FROM flux_migrations");
    expect(schema.version).toBe(1);
  } finally {
    await db?.close();
    await socket.stop();
    await embedded.close();
  }
});

test("runtime database role can use records but cannot read credentials or modify schema", async () => {
  const db = await openDatabase({});
  try {
    await migrate(db);
    await grantRuntimeRole(
      db,
      "postgresql://flux_app:Fixture-only-long-runtime-credential@localhost/flux",
    );
    const [role] = await db.query(
      "SELECT rolsuper,rolcreaterole,rolcreatedb FROM pg_roles WHERE rolname='flux_app'",
    );
    expect(role).toEqual({
      rolsuper: false,
      rolcreaterole: false,
      rolcreatedb: false,
    });
    await db.exec("SET ROLE flux_app");
    await expect(db.query("SELECT * FROM flux_jobs")).resolves.toEqual([]);
    await expect(db.query("SELECT * FROM pg_authid")).rejects.toThrow(
      /permission denied/,
    );
    await expect(db.exec("DROP TABLE flux_users")).rejects.toThrow(
      /must be owner/,
    );
    await db.exec("RESET ROLE");
    await expect(
      grantRuntimeRole(db, "postgresql://other:short@localhost/flux"),
    ).rejects.toThrow(/flux_app/);
  } finally {
    await db.close();
  }
});
