//! The web-standard globals QuickJS apps get beyond the engine's own.

use std::io::{Read, Write};
use std::time::{Duration, Instant};

use chouquette_quickjs::Engine;

#[path = "../src/fake_host.rs"]
#[allow(dead_code)] // `send`: these tests make no host events
mod fake;

/// Runs `script`, which reports by `send(0, ...)`, until it has sent `n` renders.
fn run(script: &str, n: usize) -> Vec<String> {
    let (api, host) = fake::FakeHost::api();
    let mut engine = Engine::new(api).unwrap();
    engine
        .eval(&format!(
            "const report = x => __chouquette_host.send(0, String(x));\n{script}"
        ))
        .unwrap();
    let deadline = Instant::now() + Duration::from_secs(10);
    let mut out = Vec::new();
    while out.len() < n && Instant::now() < deadline {
        engine.turn(Some(Duration::from_millis(20)));
        out.extend(host.take().into_iter().map(|(_, s)| s));
    }
    out
}

#[test]
fn text_encoding_round_trips_utf8() {
    let out = run(
        r#"const bytes = new TextEncoder().encode("héllo €");
           report(Array.from(bytes).join(","));
           report(new TextDecoder().decode(bytes));"#,
        2,
    );
    assert_eq!(out, ["104,195,169,108,108,111,32,226,130,172", "héllo €"]);
}

#[test]
fn urls_parse_and_take_search_params() {
    let out = run(
        r#"const u = new URL("../b?x=1&y=two#top", "https://example.com:8080/a/c");
           report([u.href, u.origin, u.host, u.pathname, u.search, u.hash].join(" "));
           u.searchParams.set("x", "3"); u.searchParams.append("z", "a b");
           report(u.href);
           report(new URLSearchParams("a=1&a=2").getAll("a").join("+"));
           try { new URL("nope"); } catch (e) { report(e instanceof TypeError); }"#,
        4,
    );
    assert_eq!(
        out,
        [
            "https://example.com:8080/b?x=1&y=two#top https://example.com:8080 example.com:8080 /b ?x=1&y=two #top",
            "https://example.com:8080/b?x=3&y=two&z=a+b#top",
            "1+2",
            "true",
        ]
    );
}

#[test]
fn structured_clone_copies_data() {
    let out = run(
        r#"const a = { n: 1, d: new Date(0), m: new Map([[1, [2]]]), s: new Set(["x"]) };
           a.self = a;
           const b = structuredClone(a);
           report([b !== a, b.self === b, b.d.getTime(), b.m.get(1)[0], b.s.has("x"), b.m.get(1) !== a.m.get(1)].join(","));
           try { structuredClone(() => 1); } catch (e) { report(e.name); }"#,
        2,
    );
    assert_eq!(out, ["true,true,0,2,true,true", "DataCloneError"]);
}

#[test]
fn abort_controllers_signal_listeners() {
    let out = run(
        r#"const c = new AbortController();
           c.signal.addEventListener("abort", e => report(`${e.type} ${c.signal.aborted} ${c.signal.reason}`));
           c.abort("stop");
           report(AbortSignal.abort().aborted);"#,
        2,
    );
    assert_eq!(out, ["abort true stop", "true"]);
}

#[test]
fn crypto_gives_random_values_and_uuids() {
    let out = run(
        r#"const a = crypto.getRandomValues(new Uint8Array(32));
           report(a.length + " " + a.some(x => x !== 0));
           report(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(crypto.randomUUID()));"#,
        2,
    );
    assert_eq!(out, ["32 true", "true"]);
}

#[test]
fn fetch_gets_and_posts() {
    let server = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = server.local_addr().unwrap().port();
    std::thread::spawn(move || {
        for stream in server.incoming().take(2) {
            let mut stream = stream.unwrap();
            // The whole request: its head, then content-length bytes of body.
            let mut request = Vec::new();
            let mut buf = [0; 4096];
            loop {
                let n = stream.read(&mut buf).unwrap();
                request.extend_from_slice(&buf[..n]);
                let text = String::from_utf8_lossy(&request).to_lowercase();
                if let Some(end) = text.find("\r\n\r\n") {
                    let length = text
                        .lines()
                        .find_map(|l| l.strip_prefix("content-length:"))
                        .map_or(0, |n| n.trim().parse::<usize>().unwrap());
                    if request.len() >= end + 4 + length {
                        break;
                    }
                }
                if n == 0 {
                    break;
                }
            }
            let request = String::from_utf8_lossy(&request).to_string();
            let line = request.lines().next().unwrap().to_owned();
            let body = format!(
                r#"{{"line":"{line}","echo":"{}"}}"#,
                request.rsplit("\r\n\r\n").next().unwrap()
            );
            write!(
                stream,
                "HTTP/1.1 201 Created\r\ncontent-type: application/json\r\nx-n: 7\r\ncontent-length: {}\r\n\r\n{body}",
                body.len()
            )
            .unwrap();
        }
    });
    let out = run(
        &format!(
            r#"(async () => {{
                 const r = await fetch("http://127.0.0.1:{port}/a?q=1");
                 report([r.status, r.ok, r.headers.get("X-N"), (await r.json()).line].join(" "));
                 const p = await fetch("http://127.0.0.1:{port}/b", {{ method: "POST", body: "hi", headers: {{ "content-type": "text/plain" }} }});
                 report((await p.json()).echo);
                 try {{ await fetch("http://127.0.0.1:1/"); }} catch (e) {{ report(e instanceof TypeError); }}
               }})();"#
        ),
        3,
    );
    assert_eq!(out, ["201 true 7 GET /a?q=1 HTTP/1.1", "hi", "true"]);
}
