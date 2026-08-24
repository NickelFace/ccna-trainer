-- Rows left behind by development against the live server: six keys used while building
-- sync, autosync and the QR flow, none of them anyone's progress. They are deleted by hash
-- rather than by "everything except the owner" so that a mistyped allowlist cannot take the
-- one row that matters with it.
DELETE FROM state WHERE key_hash IN (
  '3d9460e13ddb588ac0710ef035389d6b5b3e6972efe661e72319a18852b1f731',
  '921552316a8a9d65f7b9ef0bfe7eeeb5967d6f52233f54282d7452b462d274cd',
  '8e35ad91832c3a3925e9a985ec0b6433e88dc68fd478061bcb52363b5b84ff7c',
  '3592b4d24c3486fa5934ff68a07a431dc4b7b4282042409787f97de49878af8a',
  '2ef6a7884b0d20b0219082931e31e5e69c0b5eee7b333c4022dc420f49712af8',
  '6e3da18861748738de94b830cacbca6f35dd9c177de5f75bf658bbe799dec861'
);
