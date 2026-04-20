resource "aws_db_instance" "main" {
  engine               = "postgres"
  publicly_accessible  = true
  allocated_storage    = 20
}
