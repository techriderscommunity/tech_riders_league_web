"use client";

import { useState } from "react";

export function RegistrationCommunityFields({ communities }: {
  communities: { id: string; name: string }[];
}) {
  const [isStaff, setIsStaff] = useState(false);

  return <>
    <label className="management-check">
      <input name="staff" type="checkbox" onChange={event => setIsStaff(event.currentTarget.checked)} />
      Soy staff de una comunidad
    </label>
    <label htmlFor="registration-community">Comunidad (solo si solicitas staff)
      <select id="registration-community" name="community" defaultValue="" disabled={!isStaff} required={isStaff}>
        <option value="">Selecciona una comunidad</option>
        {communities.map(community => <option key={community.id} value={community.id}>{community.name}</option>)}
      </select>
    </label>
  </>;
}
