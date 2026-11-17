// Cuentas [PRUEBA K6] para las pruebas de carga (5K, D22).
//
//   node pruebas-carga/cuentas.mjs crear   -> crea admin, capturista y gerente
//                                             y guarda sus contraseñas en pruebas-carga/.env.k6
//   node pruebas-carga/cuentas.mjs borrar  -> las borra (su perfil se va con ellas)
//
// Lee la URL y la llave service_role de .env.local. Las contraseñas nunca se
// imprimen: solo quedan en .env.k6, que no se sube a git (.env* en .gitignore).

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const envFile = join(here, ".env.k6");

const ACCOUNTS = [
  { role: "admin", email: "k6.admin@example.com", name: "[PRUEBA K6] Admin" },
  { role: "capturista", email: "k6.capturista@example.com", name: "[PRUEBA K6] Capturista" },
  { role: "gerente", email: "k6.gerente@example.com", name: "[PRUEBA K6] Gerente" },
];

function readEnv(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").replace(/^﻿/, "").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = readEnv(join(root, ".env.local"));
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

async function findUsers() {
  const emails = new Set(ACCOUNTS.map((a) => a.email));
  const found = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    found.push(...data.users.filter((u) => emails.has(u.email ?? "")));
    if (data.users.length < 200) break;
  }
  return found;
}

async function crear() {
  if ((await findUsers()).length > 0) {
    throw new Error("Ya existen cuentas [PRUEBA K6]. Bórralas primero con: node pruebas-carga/cuentas.mjs borrar");
  }
  const lines = [
    "# Cuentas [PRUEBA K6] (5K). No se sube a git. Se borran con: node pruebas-carga/cuentas.mjs borrar",
    `SUPABASE_URL=${url}`,
    `SUPABASE_PUBLISHABLE_KEY=${env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}`,
  ];
  for (const a of ACCOUNTS) {
    // La política de contraseñas de Supabase pide minúscula, mayúscula, número y símbolo.
    const password = `${randomBytes(24).toString("base64url")}aZ7.`;
    const { error } = await admin.auth.admin.createUser({
      email: a.email,
      password,
      email_confirm: true,
      user_metadata: { nombre: a.name },
      app_metadata: { rol: a.role },
    });
    if (error) throw new Error(`No se pudo crear ${a.email}: ${error.message}`);
    const key = a.role.toUpperCase();
    lines.push(`K6_${key}_EMAIL=${a.email}`, `K6_${key}_PASSWORD=${password}`);
    console.log(`Creada: ${a.name} (${a.email})`);
  }
  writeFileSync(envFile, lines.join("\n") + "\n");
  console.log("Contraseñas guardadas en pruebas-carga/.env.k6");
}

async function borrar() {
  const users = await findUsers();
  for (const u of users) {
    const { error } = await admin.auth.admin.deleteUser(u.id);
    if (error) throw new Error(`No se pudo borrar ${u.email}: ${error.message}`);
    console.log(`Borrada: ${u.email}`);
  }
  if (users.length === 0) console.log("No había cuentas [PRUEBA K6].");
  if (existsSync(envFile)) unlinkSync(envFile);
}

const command = process.argv[2];
if (command === "crear") await crear();
else if (command === "borrar") await borrar();
else console.log("Uso: node pruebas-carga/cuentas.mjs crear | borrar");
