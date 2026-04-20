# INTENTIONALLY VULNERABLE — for claude-guard demos only.
resource "aws_s3_bucket" "public" {
  bucket = "my-public-bucket"
}
resource "aws_s3_bucket_acl" "public" {
  bucket = aws_s3_bucket.public.id
  acl    = "public-read"  # CG-IAC-002
}
resource "aws_security_group_rule" "open_ssh" {
  type        = "ingress"
  from_port   = 22
  to_port     = 22
  protocol    = "tcp"
  cidr_blocks = ["0.0.0.0/0"]  # CG-IAC-001
}
