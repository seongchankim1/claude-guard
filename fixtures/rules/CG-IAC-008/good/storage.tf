resource "aws_db_instance" "main" {
  engine              = "postgres"
  storage_encrypted   = true
  kms_key_id          = aws_kms_key.db.arn
  allocated_storage   = 20
}
