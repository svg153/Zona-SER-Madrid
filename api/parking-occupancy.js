"use strict";

const REST_URL = "https://servayto.madrid.es/MTPAR_RSINFO/restInfoParking/listParking?language=ES";
const SOAP_URL = "https://servayto.madrid.es/MTPAR_WSINFO/InfoParking";
const SOAP_ACTION = "http://tempuri.org/iInfoParking/GetListParking";
const CACHE_TTL_MS = 45 * 1000;
const DEFAULT_TIMEOUT_MS = 5000;

const SOAP_BODY = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">',
  '<soap:Body><tem:GetListParking><tem:language>es</tem:language></tem:GetListParking></soap:Body>',
  '</soap:Envelope>'
].join("");

function asNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstValue(object, keys) {
  if (!object || typeof object !== "object") return null;
  for (const key of keys) {
    if (object[key] !== null && object[key] !== undefined && object[key] !== "") return object[key];
  }
  return null;
}

function normalizeMoment(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function firstOccupation(entry) {
  const candidates = firstValue(entry, ["occupations", "lstOccupation", "occupation"]);
  if (Array.isArray(candidates)) return candidates.find(Boolean) || null;
  if (candidates && Array.isArray(candidates.occupation)) return candidates.occupation.find(Boolean) || null;
  if (candidates && typeof candidates === "object") return candidates;
  return null;
}

function normalizeRestEntry(entry) {
  const occupation = firstOccupation(entry);
  return {
    id: String(firstValue(entry, ["id", "parkingId", "parking_id"]) ?? ""),
    name: String(firstValue(entry, ["name", "title", "nickName"]) ?? ""),
    address: String(firstValue(entry, ["address", "direccion"]) ?? ""),
    lat: asNumber(firstValue(entry, ["latitude", "lat", "y"])),
    lon: asNumber(firstValue(entry, ["longitude", "lon", "lng", "x"])),
    freeSpaces: occupation ? asNumber(firstValue(occupation, ["free", "freeSpaces", "available"])) : null,
    measuredAt: occupation ? normalizeMoment(firstValue(occupation, ["moment", "measuredAt", "timestamp"])) : null
  };
}

function listFromRestPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  for (const key of ["parkings", "lstParking", "parking", "results", "data"]) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  return [];
}

function normalizeRestPayload(payload) {
  return listFromRestPayload(payload)
    .map(normalizeRestEntry)
    .filter((parking) => parking.id || parking.name);
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function xmlField(block, localName) {
  const expression = new RegExp(
    "<(?:[A-Za-z0-9_]+:)?" + localName + "\\b[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_]+:)?" + localName + ">",
    "i"
  );
  const match = expression.exec(block);
  return match ? decodeXml(match[1].replace(/<[^>]+>/g, "").trim()) : null;
}

function parseSoapPayload(xml) {
  if (typeof xml !== "string" || !xml.trim()) return [];
  const parkings = [];
  const expression = /<(?:[A-Za-z0-9_]+:)?lstParking\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?lstParking>/gi;
  let match;
  while ((match = expression.exec(xml)) !== null) {
    const block = match[1];
    const occupationMatch = /<(?:[A-Za-z0-9_]+:)?occupation\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?occupation>/i.exec(block);
    const occupation = occupationMatch ? occupationMatch[1] : "";
    parkings.push({
      id: String(xmlField(block, "id") || ""),
      name: String(xmlField(block, "name") || ""),
      address: String(xmlField(block, "address") || ""),
      lat: asNumber(xmlField(block, "latitude")),
      lon: asNumber(xmlField(block, "longitude")),
      freeSpaces: occupation ? asNumber(xmlField(occupation, "free")) : null,
      measuredAt: occupation ? normalizeMoment(xmlField(occupation, "moment")) : null
    });
  }
  return parkings.filter((parking) => parking.id || parking.name);
}

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, Object.assign({}, options, {signal: controller.signal}));
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFromRest(fetchImpl, timeoutMs) {
  const response = await fetchWithTimeout(fetchImpl, REST_URL, {
    method: "GET",
    headers: {"Accept": "application/json"}
  }, timeoutMs);
  if (!response.ok) throw new Error("Madrid REST returned HTTP " + response.status);
  const payload = await response.json();
  const parkings = normalizeRestPayload(payload);
  if (!parkings.length) throw new Error("Madrid REST returned no parking records");
  return {transport: "rest", parkings};
}

async function fetchFromSoap(fetchImpl, timeoutMs) {
  const response = await fetchWithTimeout(fetchImpl, SOAP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "SOAPAction": SOAP_ACTION,
      "Accept": "text/xml, application/xml"
    },
    body: SOAP_BODY
  }, timeoutMs);
  if (!response.ok) throw new Error("Madrid SOAP returned HTTP " + response.status);
  const xml = await response.text();
  const parkings = parseSoapPayload(xml);
  if (!parkings.length) throw new Error("Madrid SOAP returned no parking records");
  return {transport: "soap", parkings};
}

async function fetchParkingOccupancy(fetchImpl, timeoutMs) {
  try {
    return await fetchFromRest(fetchImpl, timeoutMs);
  } catch (restError) {
    try {
      const result = await fetchFromSoap(fetchImpl, timeoutMs);
      result.restError = restError.message;
      return result;
    } catch (soapError) {
      const error = new Error("Madrid InfoParking unavailable");
      error.restError = restError.message;
      error.soapError = soapError.message;
      throw error;
    }
  }
}

function allowedOrigin(origin) {
  if (!origin) return null;
  if (origin === "https://svg153.github.io") return origin;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  const extra = String(process.env.PARKING_OCCUPANCY_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return extra.includes(origin) ? origin : null;
}

function setCommonHeaders(res, origin) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Vary", "Origin");
  res.setHeader("Cache-Control", "public, s-maxage=45, stale-while-revalidate=60");
  const allowed = allowedOrigin(origin);
  if (allowed) res.setHeader("Access-Control-Allow-Origin", allowed);
}

function createHandler(options) {
  options = options || {};
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const now = options.now || (() => new Date());
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  let cache = null;

  return async function handler(req, res) {
    const origin = req.headers && req.headers.origin;
    const method = String(req.method || "GET").toUpperCase();
    const allowed = allowedOrigin(origin);

    if (origin && !allowed) {
      setCommonHeaders(res, null);
      return res.status(403).json({error: "origin_not_allowed"});
    }

    if (method === "OPTIONS") {
      setCommonHeaders(res, origin);
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      return res.status(204).end();
    }

    if (method !== "GET") {
      setCommonHeaders(res, origin);
      res.setHeader("Allow", "GET, OPTIONS");
      return res.status(405).json({error: "method_not_allowed"});
    }

    setCommonHeaders(res, origin);
    const currentTime = now();
    if (cache && currentTime.getTime() - cache.cachedAt < CACHE_TTL_MS) {
      res.setHeader("X-Parking-Cache", "HIT");
      return res.status(200).json(cache.payload);
    }

    try {
      const result = await fetchParkingOccupancy(fetchImpl, timeoutMs);
      const payload = {
        source: "madrid-info-parking",
        transport: result.transport,
        fetchedAt: currentTime.toISOString(),
        parkings: result.parkings
      };
      cache = {cachedAt: currentTime.getTime(), payload};
      res.setHeader("X-Parking-Cache", "MISS");
      return res.status(200).json(payload);
    } catch (error) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(503).json({
        error: "upstream_unavailable",
        message: "Madrid InfoParking is temporarily unavailable"
      });
    }
  };
}

const handler = createHandler();
module.exports = handler;
module.exports.createHandler = createHandler;
module.exports.normalizeRestPayload = normalizeRestPayload;
module.exports.parseSoapPayload = parseSoapPayload;
module.exports.fetchParkingOccupancy = fetchParkingOccupancy;
module.exports.allowedOrigin = allowedOrigin;
module.exports.constants = {REST_URL, SOAP_URL, SOAP_ACTION, CACHE_TTL_MS, DEFAULT_TIMEOUT_MS};
