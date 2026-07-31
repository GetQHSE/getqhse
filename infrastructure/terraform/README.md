# Terraform foundation

No cloud provider has been selected. The modules define contracts only; provider resources belong in
a later, reviewed decision. Pin Terraform and provider versions before the first deployment.

```bash
terraform -chdir=infrastructure/terraform/environments/staging init -backend=false
terraform -chdir=infrastructure/terraform/environments/staging fmt -check
terraform -chdir=infrastructure/terraform/environments/staging validate
```

For remote state, create the state storage and locking mechanism outside this state, then add an
environment-specific `backend` block. State must be encrypted, versioned, access-logged, and limited
to the deployment identity. Never commit backend credentials or `.tfvars`.
