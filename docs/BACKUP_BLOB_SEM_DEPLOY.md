# Jornada V2.1 — backup privado criptografado, sem deploy

## Resultado da preparação

A auditoria autenticada feita no Windows encontrou **3 objetos privados** (state, auth e secrets), totalizando **1.241 bytes**. A leitura e a validação JSON já foram concluídas. **Não é necessário repetir a auditoria.**

Agora a branch `auditoria-v2-1-sem-deploy` contém:
- `scripts/backup-crypto.mjs`: criptografia AES-256-GCM, chave derivada por scrypt, SHA-256 de cada conteúdo e conferência na recuperação.
- `scripts/backup-blob.mjs`: lista e lê os objetos com `@vercel/blob` em modo privado, verifica que a lista não mudou durante a cópia, cria o arquivo cifrado e o abre novamente para verificar.
- `scripts/run-safe-blob-backup.mjs`: utiliza Vercel CLI já autenticada, sem copiar chaves e somente no projeto Jornada (validação do ID do projeto/equipe).
- `scripts/verify-blob-backup.mjs`: prova offline que o arquivo pode ser aberto com a senha e que o conteúdo passa nos testes de integridade, sem restaurar nem publicar.
- `tests/backup-crypto.test.mjs`: cenários com três arquivos fictícios, senha errada, adulteração, integridade e vínculo de projeto incorreto.

## Procedimento único no computador autorizado

Na pasta que **já existe** no Windows (`C:\Users\Usuario\jornada-auditoria-blob`), executar:

```powershell
cd "$HOME\jornada-auditoria-blob"
git pull --ff-only
npm run backup:blob:safe
```

O terminal pedirá uma senha **nova, exclusiva e forte de pelo menos 16 caracteres** e sua confirmação. A senha é mascarada com asteriscos, não entra em argumentos do terminal, arquivo `.env`, GitHub, Drive ou logs. **Nunca transmitir a senha pelo chat.**

O programa só lê o Blob e escreve no computador um arquivo com extensão `.jbackup` em:

```
C:\Users\Usuario\Jornada-Backups\jornada-<data>.jbackup
```

O relatório final inclui `"status": "ENCRYPTED_BACKUP_VERIFIED"`, quantidade de objetos, bytes e caminho do arquivo. O backup é **verificado automaticamente no ato da criação**. Se o conteúdo mudar durante a cópia, falha sem gerar um arquivo incompleto; o processo pode ser feito depois quando não houver alterações em andamento.

Para validar de novo **somente o arquivo local** no futuro (sem rede):

```powershell
npm run backup:verify -- "$HOME\Jornada-Backups\<nome-exato-do-arquivo>.jbackup"
```

Guarde a senha separadamente, em um gerenciador confiável: **sem ela, não será possível recuperar os dados**. Não compartilhe senha, arquivo cifrado, token, capturas de dados pessoais nem `.env.local`.

## Limites e proteção

- Não executa `put`, `del`, criação de store, deploy, migração, envio WhatsApp ou alteração de produção.
- Não exporta dados em texto claro para o disco nem expõe nomes individuais/valores no relatório.
- Bloqueia outros projetos por `projectId`/`orgId`.
- Limita objetos e tamanho para impedir cópias inesperadamente grandes e gastos maiores.
- **Simulação de restauração local:** decifra e checa a integridade na memória. **Não executa restauração real no Blob**: qualquer restauração do sistema exigirá um procedimento separado, com plano e autorização específicos, pois seria uma escrita destrutiva.
- O Blob não oferece transação entre múltiplos arquivos: a verificação de inventário antes/depois detecta a maioria das mudanças concorrentes, mas não prova snapshot atômico sob gravações constantes. Fazer backup em janela tranquila.
- Cópia local única não protege contra perda do PC. Depois de criado e validado, é recomendável guardar **uma segunda cópia criptografada** fora do computador, sem divulgar a senha junto.
- Uma execução utiliza poucas operações de leitura e um arquivo local; não cria servidor, sandbox ou deploy.
- Testes **sintéticos** de criptografia passaram (5/5), e houve simulação de ponta a ponta com Blob falso e arquivo local criptografado. O backup dos arquivos reais **depende da execução de um comando na máquina já autenticada**.

**Status:** código preparado e testado com dados fictícios. Ainda é necessário o relatório real `ENCRYPTED_BACKUP_VERIFIED` para afirmar que os três arquivos da produção estão efetivamente protegidos por uma cópia verificada. Nenhum deploy autorizado.
