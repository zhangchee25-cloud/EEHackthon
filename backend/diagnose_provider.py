"""Explicit provider diagnostic. Outputs only sanitized response text, never credentials."""
import argparse
from dataclasses import replace
import json
import re
import urllib.error
import urllib.request
from .config import Config
from .model import SYSTEM_PROMPT, NoRedirect

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model')
    parser.add_argument('--full', action='store_true')
    args = parser.parse_args()
    c = Config.from_env()
    if args.model:
        c = replace(c, model=args.model)
    body = {'model': c.model, 'instructions': SYSTEM_PROMPT,
        'input': json.dumps({'question': '线性系统需要满足什么条件？', 'courseSegments': [
            {'segmentId': 'p1s1', 'page': 1, 'text': 'A linear system satisfies additivity and homogeneity.'}]}),
        'max_output_tokens': 1200, 'store': False}
    if args.full:
        from .tests.fixtures import PAGES
        body['input'] = json.dumps({'question': '材料中，一个系统要满足哪些条件才是线性的？请用中文解释。',
            'courseSegments': [{'segmentId': f'p{i+1}s1', 'page': i+1, 'text': text} for i, text in enumerate(PAGES)]}, ensure_ascii=False)
        body['max_output_tokens'] = c.max_output_tokens
    request = urllib.request.Request(c.endpoint('responses'),
        data=json.dumps(body, ensure_ascii=False).encode(), headers={
            'Authorization': 'Bearer ' + c.api_key, 'Content-Type': 'application/json',
            'User-Agent': 'LearningWorkspace/1.0'})
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=45) as response:
            value = json.loads(response.read(1000000))
            texts = [part.get('text', '') for item in value.get('output', [])
                     for part in item.get('content', []) if part.get('type') == 'output_text']
            print(json.dumps({'status': response.status, 'model': c.model,
                'text': ''.join(texts)[:6000], 'usage': value.get('usage')}, ensure_ascii=False))
    except urllib.error.HTTPError as exc:
        raw = exc.read(12000).decode('utf-8', 'replace').replace(c.api_key, '[redacted]')
        raw = re.sub(r'sk-[A-Za-z0-9_-]+', '[redacted]', raw)
        print(json.dumps({'status': exc.code, 'model': c.model,
            'retryAfter': exc.headers.get('Retry-After'), 'diagnostic': raw[:2500]}, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({'errorType': type(exc).__name__}))

if __name__ == '__main__':
    main()
