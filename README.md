# Controle do Passe Uber

Sistema online simples para controlar se o passe da Uber de 24h ou 72h está compensando.

Ele salva tudo em SQLite:

- passe de 24h ou 72h;
- valor do passe;
- data e hora de início;
- data e hora final automática;
- ganho bruto lançado;
- quantidade de corridas;
- km rodado;
- custo por km;
- líquido sem km;
- líquido com km;
- porcentagem que o passe representa;
- histórico diário, semanal e mensal;
- exportação CSV.

## Como rodar localmente

```bash
npm install
npm start
```

Depois abra:

```text
http://localhost:3000
```

## Variáveis de ambiente

```text
PORT=3000
DB_PATH=./data/controle.sqlite
APP_PIN=1234
```

`APP_PIN` é recomendado para proteger o app. Se não configurar, o app fica sem senha.

## Render

Configuração recomendada:

```text
Build Command: npm install
Start Command: npm start
```

Variáveis no Render:

```text
NODE_ENV=production
DB_PATH=/opt/render/project/src/data/controle.sqlite
APP_PIN=crie-um-pin-seguro
```

Importante: como o banco é SQLite, use um Persistent Disk montado em:

```text
/opt/render/project/src/data
```

Sem disco persistente, o arquivo SQLite pode ser perdido quando o serviço reiniciar ou fizer redeploy.

## Regras de cálculo

Porcentagem do passe:

```text
valor do passe / ganho bruto * 100
```

Líquido sem km:

```text
ganho bruto - valor do passe
```

Líquido com km:

```text
ganho bruto - valor do passe - (km rodado * custo por km)
```

Status:

- acima de 25%: pesado demais;
- entre 20% e 25%: ainda pesado;
- entre 15% e 20%: no limite;
- abaixo de 15%: mais saudável.
