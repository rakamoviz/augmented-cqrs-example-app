node node_modules/taxman-cqrs/cli.js -t evt -n 'externalapp.sale.shard01' -R redisConfig.json -r '{"prefix": "externalapp-domain"}' -D orderCreatedEvent.json -d '{"id": "000a902f-0a0d-4587-8a18-478f351b9f26", "aggregate": {"id": "928b7daa-3f4f-4660-b394-784f6370030", "revision": 1}, "meta": {"transactionId": "3300f636-7e1d-46ab-8733-c369f0708345"}}'