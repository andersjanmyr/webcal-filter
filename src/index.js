/// <reference types="@fastly/js-compute" />
import { CacheOverride } from "fastly:cache-override";
import { env } from "fastly:env";
import { includeBytes } from "fastly:experimental";

// Load a static file as a Uint8Array at compile time.
    // File path is relative to root of project, not to this file
const welcomePage = includeBytes("./src/welcome-to-compute.html");

addEventListener("fetch", (event) => event.respondWith(handleRequest(event)));

async function handleRequest(event) {
    console.log("FASTLY_SERVICE_VERSION:", env('FASTLY_SERVICE_VERSION') || 'local');

    let req = event.request;

    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
        return new Response("This method is not allowed", {
            status: 405,
        });
    }

    let url = new URL(req.url);
    console.log("URL:", req.url);

    // If request is to the `/` path...
        if (url.pathname === "/") {
            return new Response(welcomePage, {
                status: 200,
                headers: new Headers({ "Content-Type": "text/html; charset=utf-8" }),
            });
        }

    // webcal://smrt.pagerduty.com/private/XXXX/feed
    if (url.pathname.startsWith("/private")) {
        const cacheOverride = new CacheOverride("override", { ttl: 3600 });
        let beresp = await fetch(url.pathname, {
            backend: "smrt.pagerduty.com",
            cacheOverride,
            headers: req.headers,
        });
        const filter = url.searchParams.get("filter") || "First";
        const feed = await beresp.text();
        console.log(feed);
        const { header, events } = parseICS(feed);
        const filtered = events.filter(e => e.SUMMARY.includes(filter));
        console.log(filtered);
        return new Response(toICS(header, filtered), {
            status: 200,
            headers: beresp.headers,
        });
    }


    return new Response("The page you requested could not be found", {
        status: 404,
    });
}

function parseICS(icsString) {
    const lines = icsString.split('\n');
    const events = [];
    let header;
    let event;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === 'BEGIN:VCALENDAR') {
            header = {}
        } else if (line === 'END:VCALENDAR') {
        } else if (line === 'BEGIN:VEVENT') {
            event = {};
        } else if (line === 'END:VEVENT') {
            events.push(event);
            event = null;
        } else if (event == undefined) {
            addKeyValue(line, header);
        } else if (event) {
            addKeyValue(line, event);
        }
    }
    return { header, events };
}

function addKeyValue(line, event) {
    const match = /^([^:]+):(.*)$/.exec(line);
    if (match) {
        const [, key, value] = match;
        event[key] = value;
    }
}

function toICS(headers, events) {
    const icsEvents = events.map(toEvent);
    return `BEGIN:VCALENDAR\n${toEntry(headers)}\n${icsEvents.join("\n")}\nEND:VCALENDAR\n`;
}

function toEvent(event) {
    const entry = toEntry(event);
    return `BEGIN:VEVENT\n${entry}\nEND:VEVENT`;
}

function toEntry(event) {
    return Object.keys(event).map((key) => `${key}:${event[key]}`).join("\n");
}

