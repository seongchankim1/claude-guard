resource "aws_db_instance" "main" {
  engine              = "postgres"
  storage_encrypted   = false
  allocated_storage   = 20
}
