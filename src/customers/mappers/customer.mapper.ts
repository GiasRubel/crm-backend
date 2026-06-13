import { CustomerDocument } from '../customer.schema';
import { CustomerResponseDto } from '../dto/customer-response.dto';

export function toCustomerResponseDto(customer: CustomerDocument): CustomerResponseDto {
  return {
    id: customer._id.toString(),
    keycloakId: customer.keycloakId,
    email: customer.email,
    firstName: customer.firstName,
    lastName: customer.lastName,
    phone: customer.phone,
    company: customer.company,
    address: customer.address,
    notes: customer.notes,
    status: customer.status,
    createdBy: customer.createdBy,
    createdAt: (customer as any).createdAt?.toISOString() ?? '',
    updatedAt: (customer as any).updatedAt?.toISOString() ?? '',
  };
}
