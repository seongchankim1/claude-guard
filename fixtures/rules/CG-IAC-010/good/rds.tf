resource "aws_db_instance" "main" {
  engine               = "postgres"
  publicly_accessible  = false
  allocated_storage    = 20
}
