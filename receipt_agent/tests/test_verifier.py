"""Testes unitários para o módulo de verificação, scoring e fingerprint do receipt_agent."""
import datetime as dt
import unittest

from receipt_agent import verifier


SAMPLE_RECEIPT_TEXT = """Y Standard Bank
COMPROVATIVO DIGITAL
Data: 01/09/2026

Detalhes do Cliente: Doc N.º: 25034

JAIME KIALA COXI
SBICAOLU

1001487109

kz

Detalhes da Operação

Beneficiário
Nome

Titular da Conta
IBAN

Participante Beneficiário

Transacção

Referência da Transacção
Tipo

Chave KWik

Montante

Prazo de disponibilidade de
fundos

Custo

Data da Transacção
Data de Valor
Estado

Descrição

AC

JOAO CATULO

AO06 0006 **+* +++* ++ 3016 6
BFA

FT26244VJ880

Transferência KWik
AO06000600008459017130166
kz 8500

Imediato

kz 0

01/09/2026 13:28:30
01/09/2026 13:28:30
PROCESSED

Ac
"""


class TestVerifier(unittest.TestCase):
    def test_extract_transaction(self):
        ctx = {
            "amount": 8500.0,
            "bankName": "Standard Bank",
            "ownerName": "JOAO CATULO",
            "confirmationCode": "16140344",
            "orderCreatedAt": "2026-09-01T10:00:00Z",
        }
        tx = verifier.extract_transaction(SAMPLE_RECEIPT_TEXT, ctx)
        self.assertEqual(tx["transactionId"], "FT26244VJ880")
        self.assertEqual(tx["amount"], 8500.0)
        self.assertEqual(tx["currency"], "AOA")
        self.assertEqual(tx["date"], "2026-09-01")
        self.assertEqual(tx["bank"], "Standard Bank")
        self.assertEqual(tx["beneficiary"], "JOAO CATULO")
        self.assertTrue(tx["beneficiaryIban"].startswith("AO06"))

    def test_generate_fingerprint_deterministic(self):
        ctx = {"amount": 8500.0, "ownerName": "JOAO CATULO"}
        tx1 = verifier.extract_transaction(SAMPLE_RECEIPT_TEXT, ctx)
        fp1, can1 = verifier.generate_transaction_fingerprint(tx1, ctx)

        tx2 = verifier.extract_transaction(SAMPLE_RECEIPT_TEXT, ctx)
        fp2, can2 = verifier.generate_transaction_fingerprint(tx2, ctx)

        self.assertIsNotNone(fp1)
        self.assertEqual(fp1, fp2)
        self.assertEqual(can1, can2)
        self.assertIn("TX:ft26244vj880", can1)
        self.assertIn("AMT:8500.00", can1)
        self.assertIn("DT:2026-09-01", can1)

    def test_payment_risk_score_accepted(self):
        # Cria texto sintético com todos os critérios atendidos
        text = """COMPROVATIVO DE TRANSFERENCIA BANCARIA
BANCO: STANDARD BANK
BENEFICIARIO: JOAO CATULO
IBAN: AO06 0006 0000 8459 0171 3016 6
MONTANTE: 50.000,00 KZ
DATA: 08/09/2026
REF: FT999888777
DESCRITIVO: CODIGO 88776655
"""
        ctx = {
            "amount": 50000.0,
            "bankName": "Standard Bank",
            "ownerName": "JOAO CATULO",
            "confirmationCode": "88776655",
            "orderCreatedAt": "2026-09-08T12:00:00Z",
        }
        tx = verifier.extract_transaction(text, ctx)
        cross = verifier.cross_check(text, ctx, tx=tx, ocr_ok=True)
        decision = verifier.decide(cross, {"flags": [], "reasons": []}, None)

        self.assertGreaterEqual(decision["score"], 90)
        self.assertEqual(decision["status"], "PROOF_ACCEPTED")

    def test_payment_risk_score_duplicate_rejected(self):
        ctx = {"amount": 8500.0, "orderCreatedAt": "2026-09-01T10:00:00Z"}
        tx = verifier.extract_transaction(SAMPLE_RECEIPT_TEXT, ctx)
        cross = verifier.cross_check(
            SAMPLE_RECEIPT_TEXT,
            ctx,
            tx=tx,
            ocr_ok=True,
            is_duplicate_file=True,
        )
        decision = verifier.decide(cross, {"flags": ["DUPLICATE_RECEIPT"], "reasons": []}, None)

        self.assertEqual(decision["status"], "PROOF_REJECTED")
        self.assertIn("DUPLICATE_RECEIPT", decision["flags"])
        self.assertLessEqual(decision["score"], 20)

    def test_payment_risk_score_suspicious_forensics_blocks_accepted(self):
        text = """COMPROVATIVO DE TRANSFERENCIA
BANCO: BFA
BENEFICIARIO: MARIA SILVA
VALOR: 25000 KZ
DATA: 08/09/2026
DOC N.º: 12345
CODIGO: 11223344
"""
        ctx = {
            "amount": 25000.0,
            "bankName": "BFA",
            "ownerName": "MARIA SILVA",
            "confirmationCode": "11223344",
            "orderCreatedAt": "2026-09-08T10:00:00Z",
        }
        tx = verifier.extract_transaction(text, ctx)
        cross = verifier.cross_check(text, ctx, tx=tx, ocr_ok=True)
        # Forense com sinais de edição em software gráfico
        forensic = {
            "flags": ["EDITOR_METADATA"],
            "reasons": ["Metadados indicam Adobe Photoshop."],
        }
        decision = verifier.decide(cross, forensic, None)

        # Deve ser bloqueado para MANUAL_REVIEW por ter sinal de edição
        self.assertEqual(decision["status"], "MANUAL_REVIEW")
        self.assertIn("SUSPICIOUS_DOCUMENT", decision["flags"])


    def test_payment_risk_score_duplicate_fingerprint_rejected(self):
        ctx = {"amount": 8500.0, "orderCreatedAt": "2026-09-01T10:00:00Z"}
        tx = verifier.extract_transaction(SAMPLE_RECEIPT_TEXT, ctx)
        cross = verifier.cross_check(
            SAMPLE_RECEIPT_TEXT,
            ctx,
            tx=tx,
            ocr_ok=True,
            is_duplicate_fingerprint=True,
        )
        decision = verifier.decide(cross, {"flags": ["DUPLICATE_FINGERPRINT"], "reasons": []}, None)

        self.assertEqual(decision["status"], "PROOF_REJECTED")
        self.assertIn("DUPLICATE_FINGERPRINT", decision["flags"])

    def test_amount_mismatch_rejected(self):
        ctx = {
            "amount": 99999.0, # valor diferente
            "bankName": "Standard Bank",
            "ownerName": "JOAO CATULO",
            "orderCreatedAt": "2026-09-01T10:00:00Z",
        }
        tx = verifier.extract_transaction(SAMPLE_RECEIPT_TEXT, ctx)
        cross = verifier.cross_check(SAMPLE_RECEIPT_TEXT, ctx, tx=tx, ocr_ok=True)
        decision = verifier.decide(cross, {"flags": [], "reasons": []}, None)

        self.assertEqual(decision["status"], "PROOF_REJECTED")
        self.assertIn("AMOUNT_MISMATCH", decision["flags"])

if __name__ == "__main__":
    unittest.main()
