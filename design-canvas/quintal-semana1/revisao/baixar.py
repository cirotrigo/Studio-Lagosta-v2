import json, urllib.request, os
posts = json.load(open('posts.json'))
for nome, urls in posts.items():
    for i, u in enumerate(urls, 1):
        p = f'{nome}-{i}.jpg'
        if not os.path.exists(p):
            urllib.request.urlretrieve(u, p)
        print(p)
