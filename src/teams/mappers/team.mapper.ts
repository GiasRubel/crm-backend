import { UserDocument } from '../../users/users.schema';
import { TeamMemberDto, TeamResponseDto } from '../dto/team-response.dto';
import { TeamDocument } from '../team.schema';

function toTeamMemberDto(user: UserDocument): TeamMemberDto {
  return {
    keycloakId: user.keycloakId,
    email: user.email,
    firstName: user.firstName ?? '',
    lastName: user.lastName ?? '',
    role: user.role,
  };
}

export function toTeamResponseDto(
  team: TeamDocument,
  usersByKeycloakId: Map<string, UserDocument>,
  customerCount = 0,
): TeamResponseDto {
  const members = team.memberIds
    .map((id) => usersByKeycloakId.get(id))
    .filter((u): u is UserDocument => !!u)
    .map(toTeamMemberDto);

  return {
    id: team._id.toString(),
    name: team.name,
    description: team.description,
    regions: team.regions ?? [],
    leaderId: team.leaderId ?? null,
    members,
    isActive: team.isActive,
    customerCount,
    createdBy: team.createdBy,
    createdAt: team.createdAt?.toISOString() ?? '',
    updatedAt: team.updatedAt?.toISOString() ?? '',
  };
}
