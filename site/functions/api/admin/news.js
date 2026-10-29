import {stories as demoStories} from "../news.js";

const regions = new Set(["Европа", "Азия", "Америка", "Африка", "Ближний Восток", "Мир"]);
function responseHeaders(context) {
  const origin = context.request.headers.get("origin");
  const allowed = context.env.NEWS_ADMIN_ORIGIN;
  return {
    "cache-control":"no-store",
    "content-type":"application/json; charset=utf-8",
    ...(allowed && origin === allowed ? {"access-control-allow-origin":allowed, "vary":"Origin"} : {})
  };
}

function json(context, data, status=200) {
  return Response.json(data, {status, headers:responseHeaders(context)});
}

function sameSecret(a, b) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

function authorize(context) {
  const origin = context.request.headers.get("origin");
  if (!context.env.NEWS_ADMIN_ORIGIN || origin !== context.env.NEWS_ADMIN_ORIGIN) {
    return json(context, {error:"Запрос разрешён только с сайта админ-панели."}, 403);
  }
  const password = context.env.NEWS_ADMIN_PASSWORD;
  if (!password) return json(context, {error:"Админ-панель ещё не настроена на сервере."}, 503);
  const token = context.request.headers.get("authorization") || "";
  if (!token.startsWith("Bearer ") || !sameSecret(token.slice(7), password)) {
    return json(context, {error:"Неверный пароль."}, 401);
  }
  if (!context.env.NEWS_DB) return json(context, {error:"База новостей не подключена."}, 503);
  return null;
}

function validate(input) {
  const item = {};
  for (const key of ["region", "title", "description", "source", "time", "url", "image", "alt", "body"]) {
    item[key] = typeof input?.[key] === "string" ? input[key].trim() : "";
  }
  if (!regions.has(item.region)) return "Выберите регион из списка.";
  for (const [key, label, max] of [["title","Заголовок",220],["description","Описание",600],["source","Источник",80],["time","Время",80],["url","Ссылка на источник",2000],["image","Ссылка на изображение",2000]]) {
    if (!item[key]) return `Заполните поле «${label}».`;
    if (item[key].length > max) return `Поле «${label}» слишком длинное.`;
  }
  if (item.alt.length > 240 || item.body.length > 20000) return "Подпись или текст заметки слишком длинные.";
  try {
    if (!/^https?:$/.test(new URL(item.url).protocol) || !/^https?:$/.test(new URL(item.image).protocol)) throw new Error();
  } catch {
    return "Ссылки должны начинаться с https:// или http://.";
  }
  return item;
}

async function initializeIfEmpty(db) {
  const initialized = await db.prepare("SELECT value FROM app_meta WHERE key='demo_seeded'").first();
  if (initialized) return;
  const count = await db.prepare("SELECT COUNT(*) AS count FROM news").first();
  const statement = db.prepare("INSERT OR IGNORE INTO news (id, region, title, description, source, time, url, image, alt, body) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  const operations = count?.count ? [] : demoStories.map(item => statement.bind(item.id, item.region, item.title, item.description, item.source, item.time, item.url, item.image, item.alt || "", item.body || ""));
  operations.push(db.prepare("INSERT OR IGNORE INTO app_meta (key, value) VALUES ('demo_seeded', '1')"));
  await db.batch(operations);
}

export async function onRequestGet(context) {
  const denied = authorize(context);
  if (denied) return denied;
  await initializeIfEmpty(context.env.NEWS_DB);
  const {results=[]} = await context.env.NEWS_DB.prepare("SELECT id, region, title, description, source, time, url, image, alt, body FROM news ORDER BY created_at DESC").all();
  return json(context, {stories:results});
}

export async function onRequestOptions(context) {
  const origin = context.request.headers.get("origin");
  if (!context.env.NEWS_ADMIN_ORIGIN || origin !== context.env.NEWS_ADMIN_ORIGIN) {
    return new Response(null, {status:403, headers:{"cache-control":"no-store"}});
  }
  return new Response(null, {status:204, headers:{
    "access-control-allow-origin":context.env.NEWS_ADMIN_ORIGIN,
    "access-control-allow-methods":"GET, POST, PUT, DELETE, OPTIONS",
    "access-control-allow-headers":"authorization, content-type",
    "access-control-max-age":"86400",
    "vary":"Origin"
  }});
}

export async function onRequestPost(context) {
  const denied = authorize(context);
  if (denied) return denied;
  const input = await context.request.json().catch(() => null);
  const item = validate(input);
  if (typeof item === "string") return json(context, {error:item}, 400);
  const id = crypto.randomUUID();
  await context.env.NEWS_DB.prepare("INSERT INTO news (id, region, title, description, source, time, url, image, alt, body) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, item.region, item.title, item.description, item.source, item.time, item.url, item.image, item.alt, item.body).run();
  return json(context, {story:{id,...item}}, 201);
}

export async function onRequestPut(context) {
  const denied = authorize(context);
  if (denied) return denied;
  const input = await context.request.json().catch(() => null);
  if (typeof input?.id !== "string" || !input.id) return json(context, {error:"Не указан ID новости."}, 400);
  const item = validate(input);
  if (typeof item === "string") return json(context, {error:item}, 400);
  const result = await context.env.NEWS_DB.prepare("UPDATE news SET region=?, title=?, description=?, source=?, time=?, url=?, image=?, alt=?, body=? WHERE id=?")
    .bind(item.region, item.title, item.description, item.source, item.time, item.url, item.image, item.alt, item.body, input.id).run();
  if (!result.meta?.changes) return json(context, {error:"Новость не найдена."}, 404);
  return json(context, {story:{id:input.id,...item}});
}

export async function onRequestDelete(context) {
  const denied = authorize(context);
  if (denied) return denied;
  const id = new URL(context.request.url).searchParams.get("id");
  if (!id) return json(context, {error:"Не указан ID новости."}, 400);
  const result = await context.env.NEWS_DB.prepare("DELETE FROM news WHERE id=?").bind(id).run();
  if (!result.meta?.changes) return json(context, {error:"Новость не найдена."}, 404);
  return json(context, {ok:true});
}
