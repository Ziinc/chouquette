//! The native half of web.js: URL parsing, random bytes and HTTP.

use std::sync::mpsc::Sender;

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD;

/// The WHATWG parse of `href` (against `base`), as JSON of its parts; None
/// if it does not parse.
pub fn url(href: String, base: Option<String>) -> Option<String> {
    let parsed = match base {
        Some(base) => url::Url::parse(&base).ok()?.join(&href).ok()?,
        None => url::Url::parse(&href).ok()?,
    };
    let host = parsed.host_str().unwrap_or("").to_owned();
    let port = parsed.port().map(|p| p.to_string()).unwrap_or_default();
    let nonempty = |prefix: &str, part: Option<&str>| {
        part.filter(|p| !p.is_empty())
            .map(|p| format!("{prefix}{p}"))
            .unwrap_or_default()
    };
    Some(
        serde_json::json!({
            "href": parsed.as_str(),
            "origin": parsed.origin().ascii_serialization(),
            "protocol": format!("{}:", parsed.scheme()),
            "username": parsed.username(),
            "password": parsed.password().unwrap_or(""),
            "host": if port.is_empty() { host.clone() } else { format!("{host}:{port}") },
            "hostname": host,
            "port": port,
            "pathname": parsed.path(),
            "search": nonempty("?", parsed.query()),
            "hash": nonempty("#", parsed.fragment()),
        })
        .to_string(),
    )
}

/// `n` bytes from the operating system's random source.
pub fn random(n: usize) -> Vec<u8> {
    let mut bytes = vec![0; n.min(65536)];
    getrandom::fill(&mut bytes).expect("the system's random source");
    bytes
}

/// Makes the request on a thread of its own and hands the answer to the JS
/// thread as a `__chouquette_fetch` event.
pub fn fetch(
    events: Sender<Vec<u8>>,
    id: f64,
    method: String,
    url: String,
    headers: String,
    body: Option<String>,
) {
    std::thread::spawn(move || {
        let answer = match request(&method, &url, &headers, body.as_deref()) {
            Ok((status, status_text, headers, body)) => serde_json::json!({
                "type": "__chouquette_fetch", "id": id, "status": status, "statusText": status_text,
                "headers": headers, "body": STANDARD.encode(body),
            }),
            Err(error) => {
                serde_json::json!({"type": "__chouquette_fetch", "id": id, "error": error})
            }
        };
        let _ = events.send(answer.to_string().into_bytes());
    });
}

type Answer = (u16, String, Vec<(String, String)>, Vec<u8>);

fn request(method: &str, url: &str, headers: &str, body: Option<&str>) -> Result<Answer, String> {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .http_status_as_error(false)
        .build()
        .into();
    let headers: Vec<(String, String)> =
        serde_json::from_str(headers).map_err(|e| e.to_string())?;
    let mut builder = ureq::http::Request::builder().method(method).uri(url);
    for (name, value) in &headers {
        builder = builder.header(name, value);
    }
    let body = body
        .map(|b| STANDARD.decode(b))
        .transpose()
        .map_err(|e| e.to_string())?;
    let response = match body {
        Some(bytes) => agent.run(builder.body(bytes).map_err(|e| e.to_string())?),
        None => agent.run(builder.body(()).map_err(|e| e.to_string())?),
    }
    .map_err(|e| e.to_string())?;
    let status = response.status();
    let headers = response
        .headers()
        .iter()
        .map(|(k, v)| {
            (
                k.to_string(),
                String::from_utf8_lossy(v.as_bytes()).into_owned(),
            )
        })
        .collect();
    let bytes = response
        .into_body()
        .read_to_vec()
        .map_err(|e| e.to_string())?;
    Ok((
        status.as_u16(),
        status.canonical_reason().unwrap_or("").to_owned(),
        headers,
        bytes,
    ))
}
