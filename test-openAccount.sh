node node_modules/taxman-cqrs/cli.js -t cmd -n 'example-app.routemanagement.shard01' -R redisConfig.json -r '{"prefix": "example-app-domain"}' -D openAccountCommand.json -d '{"id": "000a902f-0a0d-4587-8a18-478f351b9f27", "aggregate": {"id": "928b7daa-3f4f-4660-b394-784f6370031", "revision": 0}}'